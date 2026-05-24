-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)

-- People table
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Key facts about a person
CREATE TABLE facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Things they already know (told them)
CREATE TABLE told (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Interaction log
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_people_user_id ON people(user_id);
CREATE INDEX idx_facts_person_id ON facts(person_id);
CREATE INDEX idx_told_person_id ON told(person_id);
CREATE INDEX idx_interactions_person_id ON interactions(person_id);

-- Row Level Security: each user can only access their own data
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE told ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own people"
  ON people FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage facts for their people"
  ON facts FOR ALL
  USING (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage told for their people"
  ON told FOR ALL
  USING (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage interactions for their people"
  ON interactions FOR ALL
  USING (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()))
  WITH CHECK (person_id IN (SELECT id FROM people WHERE user_id = auth.uid()));

-- Clothes table
CREATE TABLE clothes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wear log for each clothing item
CREATE TABLE clothing_wears (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clothing_id UUID NOT NULL REFERENCES clothes(id) ON DELETE CASCADE,
  wear_type TEXT NOT NULL CHECK (wear_type IN ('BW', 'JL', 'FD')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_clothes_user_id ON clothes(user_id);
CREATE INDEX idx_clothing_wears_clothing_id ON clothing_wears(clothing_id);

-- Row Level Security
ALTER TABLE clothes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clothing_wears ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own clothes"
  ON clothes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage wears for their clothes"
  ON clothing_wears FOR ALL
  USING (clothing_id IN (SELECT id FROM clothes WHERE user_id = auth.uid()))
  WITH CHECK (clothing_id IN (SELECT id FROM clothes WHERE user_id = auth.uid()));

-- Stories table: free-form titled text entries
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stories_user_id ON stories(user_id);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own stories"
  ON stories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
