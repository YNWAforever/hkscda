"""Portable R66 identity checks; synthetic bytes are not catalog evidence."""
import hashlib, importlib.util, pathlib, unittest

path = pathlib.Path(__file__).with_name("task-12-package-reference.py")
spec = importlib.util.spec_from_file_location("reference", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.raw = b"unchanged synthetic shared input\n"
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.pin = {"rawSha256": self.sha, "rawBytes": len(self.raw),
                    "rawGitBlob": module.git_blob(self.raw), "baseCommit": "f" * 40,
                    "archivePath": "existing/synthetic.source"}

    def test_exact_existing_bytes_and_identity(self):
        self.assertEqual(module.validate_identity(self.raw, self.pin, self.pin), self.pin)

    def test_modified_bytes_rejected(self):
        with self.assertRaises(ValueError):
            module.validate_identity(self.raw + b"new", self.pin, self.pin)

    def test_missing_base_object_rejected(self):
        with self.assertRaises(ValueError):
            module.validate_identity(None, self.pin, self.pin)

    def test_each_identity_field_required(self):
        for key in self.pin:
            with self.subTest(key=key), self.assertRaises(ValueError):
                wrong = dict(self.pin); wrong[key] = "wrong"
                module.validate_identity(self.raw, self.pin, wrong)

    def test_new_payload_is_not_shared(self):
        self.assertIsNone(module.resolve_shared(self.raw + b"new", {self.sha: self.pin}))

    def test_existing_payload_requires_validated_identity(self):
        wrong = dict(self.pin); wrong["rawGitBlob"] = "0" * 40
        with self.assertRaises(ValueError):
            module.resolve_shared(self.raw, {self.sha: wrong})

    def test_reference_preserves_original_locator(self):
        entry = module.translation_entry("own/original.stdout.log", self.raw, self.pin)
        self.assertEqual(entry["originalPath"], "own/original.stdout.log")
        self.assertEqual(entry["archivePath"], "existing/synthetic.source")
        self.assertEqual(entry["evidenceKind"], "existing-base-shared-input")
        self.assertEqual(entry["baseCommit"], "f" * 40)

if __name__ == "__main__":
    unittest.main()
