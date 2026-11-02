-- Sign-in emails are matched after trim and lower. Checked beforehand: lower(btrim(email)) has no duplicates.
UPDATE "User"
SET email = lower(btrim(email))
WHERE email <> lower(btrim(email));
