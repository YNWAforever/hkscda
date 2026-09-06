import unittest
from animal_replacement import project_animal

class ReplacementTests(unittest.TestCase):
    def row(self,**changes):
        return {'id':'1','name':'Test cat','type':'cat','gender':'f','status':'S','birthday':'2020-01-01','is_adoptable':'1','is_inside_support_pool':'0',**changes}
    def test_one_identity_can_have_two_memberships(self):
        result=project_animal(self.row(is_inside_support_pool='1'),'2026-09-07',{})
        self.assertTrue(result['adoption_candidate'])
        self.assertTrue(result['sponsorship_candidate'])
        self.assertEqual(result['public_fields']['type'],'cat')
    def test_explicit_lifecycle_dates_override_flags(self):
        for field in ('deleted_at','died_at','adopted_at'):
            result=project_animal(self.row(**{field:'2026-01-01'}),'2026-09-07',{})
            self.assertFalse(result['adoption_candidate'])
            self.assertFalse(result['sponsorship_candidate'])
    def test_unknown_status_is_preserved_not_translated(self):
        result=project_animal(self.row(status='A'),'2026-09-07',{})
        self.assertEqual(result['legacy_status'],'A')
        self.assertNotIn('status',result['public_fields'])
    def test_internal_notes_never_reach_public_fields(self):
        result=project_animal(self.row(remarks='private household',chip_remarks='private chip'),'2026-09-07',{})
        self.assertNotIn('private',str(result['public_fields']))
    def test_missing_gender_not_invented(self):
        result=project_animal(self.row(gender=None),'2026-09-07',{})
        self.assertIsNone(result['public_fields']['gender'])
        self.assertFalse(result['adoption_candidate'])
    def test_shared_attachment_photo_stays_held(self):
        result=project_animal(self.row(),'2026-09-07',{'1':{'object_name':'photo.jpeg','also_adoption_attachment':True}})
        self.assertIsNone(result['photo_candidate'])
        self.assertIn('photo_also_adoption_attachment',result['holds'])
    def test_missing_birthday_is_unknown(self):
        result=project_animal(self.row(birthday=None),'2026-09-07',{})
        self.assertEqual(result['public_fields']['age'],'不詳')

if __name__=='__main__': unittest.main()
