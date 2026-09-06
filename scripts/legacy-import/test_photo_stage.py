import unittest
from photo_stage import safe_basename, unique_match

class PhotoMatchTests(unittest.TestCase):
    def test_exact_stored_basename(self):
        self.assertEqual(safe_basename('uploads/animals/abc.jpeg'),'abc.jpeg')
    def test_rejects_traversal_urls_and_windows_paths(self):
        for value in ['../abc.jpeg','https://example.com/a.jpeg','C:\\private\\a.jpeg','uploads/%2e%2e/a.jpeg']:
            with self.assertRaises(ValueError): safe_basename(value)
    def test_duplicate_metadata_is_ambiguous(self):
        self.assertIsNone(unique_match('abc.jpeg',{'abc.jpeg':['1','2']},{'abc.jpeg':['path']}))
    def test_duplicate_local_basename_is_ambiguous(self):
        self.assertIsNone(unique_match('abc.jpeg',{'abc.jpeg':['1']},{'abc.jpeg':['a','b']}))
    def test_case_is_not_silently_folded(self):
        self.assertIsNone(unique_match('ABC.jpeg',{'abc.jpeg':['1']},{'ABC.jpeg':['path']}))
    def test_unique_match_preserves_file_id(self):
        self.assertEqual(unique_match('abc.jpeg',{'abc.jpeg':['7']},{'abc.jpeg':['path']}),('7','path'))

class PrivateWriteTests(unittest.TestCase):
    def test_blob_failure_leaves_no_final_file_and_retry_succeeds(self):
        import tempfile,hashlib
        from pathlib import Path
        from unittest.mock import patch
        from photo_stage import atomic_blob
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); data=b'synthetic'; digest=hashlib.sha256(data).hexdigest()
            with patch('photo_stage.os.link',side_effect=OSError('simulated interruption')):
                with self.assertRaises(OSError): atomic_blob(root,digest,'.jpeg',data)
            self.assertEqual(list(root.iterdir()),[])
            self.assertTrue(atomic_blob(root,digest,'.jpeg',data))
            self.assertFalse(atomic_blob(root,digest,'.jpeg',data))
    def test_manifest_rejects_symlink(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from photo_stage import atomic_manifest
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'manifest.json'
            with patch.object(Path,'is_symlink',return_value=True):
                with self.assertRaises(ValueError): atomic_manifest(target,b'{}')
            self.assertFalse(target.exists())
    def test_manifest_does_not_touch_fixed_old_temp_path(self):
        import tempfile
        from pathlib import Path
        from photo_stage import atomic_manifest
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'manifest.json'; old=Path(folder)/'manifest.json.tmp'
            old.write_bytes(b'preserve')
            atomic_manifest(target,b'{}')
            self.assertEqual(old.read_bytes(),b'preserve')
            self.assertEqual(target.read_bytes(),b'{}')

if __name__=='__main__': unittest.main()
