import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'compatible-update.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.package = json.dumps({'version': '1.0', 'dependencies': {'same': '1'}}).encode()

    def merge(self, base, ours, new):
        return m.merge_tree(dict({'package.json': self.package}, **base), dict({'package.json': self.package}, **ours), dict({'package.json': self.package}, **new), self.dir)

    def test_safe_paths_and_selection(self):
        self.assertTrue(m.selected('src/new.js'))
        for name in ('../config.json', '/src/a.js', 'src/../../a', 'config.json', 'state/log'):
            self.assertFalse(m.selected(name))

    def test_upstream_only_change_keeps_private_overlay(self):
        result = self.merge({'src/a.js': b'old'}, {'src/a.js': b'old', 'whale-compat/a.mjs': b'custom'}, {'src/a.js': b'new'})
        self.assertEqual(result['src/a.js'], b'new')
        self.assertEqual(result['whale-compat/a.mjs'], b'custom')

    def test_three_way_merge_preserves_both_nonoverlapping_changes(self):
        base = b'first\n' + b'line\n' * 8 + b'last\n'
        result = self.merge({'src/a.js': base}, {'src/a.js': base.replace(b'first', b'custom')}, {'src/a.js': base.replace(b'last', b'upstream')})
        self.assertIn(b'custom', result['src/a.js'])
        self.assertIn(b'upstream', result['src/a.js'])

    def test_conflict_holds_without_overwriting_anything(self):
        with self.assertRaisesRegex(RuntimeError, 'merge_conflict'):
            self.merge({'src/a.js': b'base\n'}, {'src/a.js': b'ours\n'}, {'src/a.js': b'theirs\n'})

    def test_dependency_changes_require_review(self):
        changed = json.dumps({'version': '2.0', 'dependencies': {'new': '1'}}).encode()
        with self.assertRaisesRegex(RuntimeError, 'dependency_or_runtime_contract_changed'):
            m.merge_tree({'package.json': self.package}, {'package.json': self.package}, {'package.json': changed}, self.dir)

    def test_customized_deletion_and_new_plugin_are_held(self):
        with self.assertRaisesRegex(RuntimeError, 'merge_conflict'):
            self.merge({'src/a.js': b'base'}, {'src/a.js': b'custom'}, {})
        with self.assertRaisesRegex(RuntimeError, 'new_plugin_or_preset'):
            self.merge({}, {}, {'plugins/new/tools.js': b'new'})

    def test_transitive_dependency_change_is_held_even_with_identical_ranges(self):
        old = json.dumps({'version': '1', 'packages': {'': {'version': '1'}, 'node_modules/same': {'version': '1'}}}).encode()
        new = json.dumps({'version': '2', 'packages': {'': {'version': '2'}, 'node_modules/same': {'version': '2'}}}).encode()
        with self.assertRaisesRegex(RuntimeError, 'dependency_lock_changed'):
            self.merge({'package-lock.json': old}, {'package-lock.json': old}, {'package-lock.json': new})

    def test_lock_root_version_metadata_alone_does_not_block_compatible_update(self):
        old = json.dumps({'version': '1', 'packages': {'': {'version': '1'}, 'node_modules/same': {'version': '1'}}}).encode()
        new = json.dumps({'version': '2', 'packages': {'': {'version': '2'}, 'node_modules/same': {'version': '1'}}}).encode()
        self.assertEqual(self.merge({'package-lock.json': old}, {'package-lock.json': old}, {'package-lock.json': new})['package-lock.json'], new)


if __name__ == '__main__':
    unittest.main()
