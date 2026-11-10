# -*- coding: utf-8 -*-
"""Compatibility entry; preserves existing cron, monthly files and checkpoint."""
from memory_archive import main
if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception:
        print("archive unavailable; checkpoint preserved")
        raise SystemExit(1)
