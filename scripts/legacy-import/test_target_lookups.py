import unittest
from target_lookups import map_lookup, literal

class TargetLookupTests(unittest.TestCase):
    def test_stable_table_scoped_ids_and_inactive_defaults(self):
        row={'id':'1','name':'來源','name_zh':'來源','name_en':'Source'}
        first=map_lookup('arrival_sources',row)
        self.assertEqual(first,map_lookup('arrival_sources',row))
        self.assertNotEqual(first['id'],map_lookup('living_areas',row)['id'])
        self.assertFalse(first['is_active'])
    def test_rejects_missing_label_and_fractional_cents(self):
        with self.assertRaises(ValueError): map_lookup('living_areas',{'id':'1','name':''})
        with self.assertRaises(ValueError): map_lookup('adoption_fees',{'id':'1','description':'Fee','amount':'1.001'})
    def test_exact_money(self):
        row=map_lookup('adoption_fees',{'id':'1','description':'Fee','amount':'10.10'})
        self.assertEqual(row['amount_cents'],1010)
    def test_quotes_are_literal_and_nul_rejected(self):
        self.assertEqual(literal("a'; DROP TABLE x;--"),"'a''; DROP TABLE x;--'")
        with self.assertRaises(ValueError): literal('x\0y')

class ProvenanceTests(unittest.TestCase):
    def test_staging_key_must_match_payload_id(self):
        with self.assertRaises(ValueError):
            map_lookup('living_areas',{'id':'1','name':'Area'},legacy_id='2')

if __name__=='__main__': unittest.main()
