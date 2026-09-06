import copy
import hashlib
import json
import unittest
import uuid

import public_profiles as profiles


class PublicProfileTests(unittest.TestCase):
    def row(self, **changes):
        return dict(id='1', code=' C001 ', birthday='2020-02-29', is_castrated='null',
                    suitable_for='newbie', updated_at='2026-09-06 15:00:00', **changes)

    def test_nullable_neutering(self):
        for raw, expected in [(None, None), ('null', None), ('', None), ('0', False), ('1', True), ('yes', None)]:
            row = self.row(); row['is_castrated'] = raw
            self.assertIs(profiles.project_profile(row, '2026-09-07')[0]['neutered'], expected)

    def test_dates_code_and_suitability(self):
        result, _ = profiles.project_profile(self.row(), '2026-09-07')
        self.assertEqual((result['code'], result['birthday'], result['recordDate']), ('C001', '2020-02-29', '2026-09-06'))
        for field, bad, target in [('birthday', '2020-02-30', 'birthday'), ('birthday', '2027-01-01', 'birthday'), ('birthday', '20200101', 'birthday'), ('code', '<script>', 'code'), ('suitable_for', 'everyone', 'suitability'), ('updated_at', '2026-09-06 garbage', 'recordDate')]:
            row = self.row(); row[field] = bad
            self.assertIsNone(profiles.project_profile(row, '2026-09-07')[0][target])

    def test_detailed_text_always_held_and_private_fields_excluded(self):
        row = self.row(personality_description='Quiet cat', health_description='Contact example@example.test', story='義工電話 9123 4567', remarks='private', cage='private', chip_remarks='private', castration_volunteer_name='private')
        result, holds = profiles.project_profile(row, '2026-09-07')
        self.assertEqual(set(result), {'code','birthday','neutered','suitability','personality','health','story','recordDate'})
        self.assertTrue(all(result[f] is None for f in ['personality','health','story']))
        self.assertNotIn('private', json.dumps(result))
        self.assertIn('contact_details', holds['health']['reasons'])
        self.assertIn('internal_reference', holds['story']['reasons'])
        self.assertEqual(holds['personality']['reasons'], ['public_review_required'])

    def test_source_identity_and_hash_guards(self):
        row = self.row(); key = str(uuid.uuid5(uuid.NAMESPACE_URL, 'hkscda:legacy:v1:animals:1'))
        candidate = {'source_sha256':profiles.SOURCE_HASH, 'animals':[{'legacy_id':'1','canonical_candidate_id':key,'adoption_candidate':True,'sponsorship_candidate':False}]}
        digest = 'a'*64
        applied = {'batch':{'state':'applied','source_sha256':profiles.SOURCE_HASH,'candidate_sha256':digest},'rows':[{'animal_id':key,'after_image':{'id':key}}]}
        result = profiles.build_projection([('1',row)], candidate, digest, applied, '2026-09-07', expected_count=1)
        self.assertEqual(result[0][0]['animal_id'], key)
        self.assertEqual(result[0][0]['source_row_sha256'], hashlib.sha256(profiles.encode(row)).hexdigest())
        self.assertEqual(result, profiles.build_projection([('1',row)], candidate, digest, applied, '2026-09-07', expected_count=1))
        for mutation in ['source','id','applied','hash','row']:
            c=copy.deepcopy(candidate); a=copy.deepcopy(applied); r=copy.deepcopy(row)
            if mutation=='source': c['source_sha256']='bad'
            if mutation=='id': c['animals'][0]['canonical_candidate_id']=str(uuid.uuid4())
            if mutation=='applied': a['rows']=[]
            if mutation=='hash': a['batch']['candidate_sha256']='bad'
            if mutation=='row': r['id']='2'
            with self.assertRaises(ValueError): profiles.build_projection([('1',r)],c,digest,a,'2026-09-07',expected_count=1)


    def test_review_is_exact_and_unsafe_text_cannot_be_cleared(self):
        row = self.row(personality_description='Quiet cat', story='Call 9123 4567')
        approvals = {f: [hashlib.sha256(text.encode()).hexdigest()] for f, text in [('personality', 'Quiet cat'), ('story', 'Call 9123 4567')]}
        result, review = profiles.project_profile(row, '2026-09-07', approvals)
        self.assertEqual(result['personality'], 'Quiet cat')
        self.assertEqual(review['personality']['verdict'], 'cleared')
        self.assertIsNone(result['story'])
        row['personality_description'] = 'Quiet cat changed'
        self.assertIsNone(profiles.project_profile(row, '2026-09-07', approvals)[0]['personality'])

    def test_staging_bytes_must_match_verified_snapshot(self):
        with self.assertRaises(ValueError): profiles.verify_staging_bytes(b'changed database')


if __name__ == '__main__': unittest.main()
