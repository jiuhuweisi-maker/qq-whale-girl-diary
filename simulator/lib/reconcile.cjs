// Shared by the generated bridge and offline fault tests. An empty history is
// deliberately not proof of non-delivery. Only a correlated authoritative
// negative receipt may permit one bounded retry of that exact packet.
function createReconciler({ store, namespace, now, probe, send, diag, interval = 60000 }) {
  let running = false;
  async function tick() {
    if (running || !store.healthy) return { skipped: true };
    running = true;
    const result = { confirmed: 0, retried: 0, unresolved: 0, expired: 0 };
    try {
      for (const [batchId, batch] of Object.entries(store.data.outbox)) {
        if (batch.status !== 'uncertain' || now() < (batch.nextCheckAt || 0)) continue;
        const index = batch.attempts.findIndex(a => a.status === 'uncertain');
        if (index < 0) continue;
        const attempt = batch.attempts[index];
        let evidence;
        try { evidence = await probe({ namespace, batchId, index, attempt: JSON.parse(JSON.stringify(attempt)) }); }
        catch { evidence = null; }
        const correlated = evidence && evidence.namespace === namespace && evidence.requestId === attempt.requestId && evidence.digest === attempt.digest && evidence.action === attempt.action && String(evidence.recipient) === String(attempt.recipient);
        const commit = edit => store.change(s => edit(s.outbox[batchId], s));
        const settle = (out, s, status) => {
          out.status = status;
          for (const key of out.keys || []) if (s.inbox[key]) s.inbox[key].stage = 'completed';
        };
        if (correlated && evidence.status === 'delivered' && evidence.messageId != null) {
          if (!commit((out, s) => { out.attempts[index].status = 'sent'; out.attempts[index].messageId = String(evidence.messageId); out.reconciledAt = now(); settle(out, s, out.attempts.every(a => a.status !== 'uncertain') ? 'sent' : 'uncertain'); })) break;
          result.confirmed++;
        } else if (correlated && evidence.status === 'not_delivered' && evidence.authoritative === true && evidence.proof === 'request-status' && typeof evidence.receiptId === 'string' && evidence.receiptId) {
          const expired = batch.deadline && now() >= batch.deadline;
          if (expired || !attempt.body || (attempt.retries || 0) >= 1) {
            if (!commit((out, s) => { out.attempts[index].status = 'rejected'; out.resolution = expired ? 'expired_without_retry' : 'no_safe_retry_payload_or_limit'; settle(out, s, 'rejected'); })) break;
            result.expired += Number(!!expired);
            continue;
          }
          // Persist the retry intent before the network boundary. A crash now
          // must not make another restart replay this request again.
          if (!commit(out => { out.attempts[index].retries = 1; out.attempts[index].retryReceipt = evidence.receiptId; out.attempts[index].retryStartedAt = now(); out.nextCheckAt = now() + interval; })) break;
          let sent;
          try { sent = await send(attempt.action, JSON.parse(JSON.stringify(attempt.body))); }
          catch { sent = { ok: false, 不确定: true }; }
          if (!commit((out, s) => {
            out.attempts[index].status = sent.不确定 ? 'uncertain' : sent.ok ? 'sent' : 'rejected';
            if (sent.数据?.data?.message_id != null) out.attempts[index].messageId = String(sent.数据.data.message_id);
            if (!sent.不确定) settle(out, s, sent.ok ? 'sent' : 'rejected');
          })) break;
          result.retried++;
        } else {
          if (!commit(out => { out.nextCheckAt = now() + interval; out.resolution = 'awaiting_correlated_evidence'; })) break;
          result.unresolved++;
        }
      }
    } finally { running = false; }
    if (result.confirmed || result.retried) diag('发件对账完成：确认' + result.confirmed + '，有凭据重试' + result.retried);
    return result;
  }
  return { tick };
}
module.exports = { createReconciler };
