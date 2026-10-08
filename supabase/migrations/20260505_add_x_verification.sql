ALTER TABLE profiles ADD COLUMN IF NOT EXISTS x_verified boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS x_oauth_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS x_avatar_url text;

CREATE INDEX IF NOT EXISTS idx_profiles_x_verified ON profiles(x_verified) WHERE x_verified = true;
