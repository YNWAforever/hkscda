import unittest
from photo_publication import remove_metadata

class MetadataTests(unittest.TestCase):
    def test_removes_metadata_keeps_encoded_scan_and_colour_profile(self):
        segment=lambda marker,value: b"\xff"+bytes([marker])+(len(value)+2).to_bytes(2,'big')+value
        scan=segment(0xda,b'header')+b'pixels\xff\x00more\xff\xd0pixels'
        colour=segment(0xe2,b'ICC_PROFILE')
        raw=b'\xff\xd8'+segment(0xe1,b'ExifGPS')+segment(0xed,b'IPTC')+colour+scan+segment(0xfe,b'private comment')+b'\xff\xd9secret trailer'
        self.assertEqual(remove_metadata(raw),b'\xff\xd8'+colour+scan+b'\xff\xd9')
    def test_rejects_truncated_image(self):
        with self.assertRaises(ValueError): remove_metadata(b'\xff\xd8\xff\xe1\x00\x10bad')
    def test_idempotent(self):
        data=b'\xff\xd8\xff\xda\x00\x02pixels\xff\xd9'
        self.assertEqual(remove_metadata(remove_metadata(data)),data)
