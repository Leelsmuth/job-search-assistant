-- RLS for resume parsing pipeline tables (idempotent)

ALTER TABLE resume_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsed_resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their resume extractions" ON resume_extractions;
CREATE POLICY "Users own their resume extractions" ON resume_extractions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own their parsed resume versions" ON parsed_resume_versions;
CREATE POLICY "Users own their parsed resume versions" ON parsed_resume_versions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own their certifications" ON candidate_certifications;
CREATE POLICY "Users own their certifications" ON candidate_certifications
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );
