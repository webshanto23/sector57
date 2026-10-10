
! pnpm --filter @s57/api build
! pnpm --filter @s57/api create-admin
! pnpm --filter @s57/api reset-password

create-admin asks for:
- your full name in Bangla (or as written)
- your name in English (optional)
- a mobile number like 01XXXXXXXXX
- a password of at least 8 characters, typed twice and hidden

Then sign in at http://localhost:3000/login with that mobile number and password. If you forget the password later, pnpm --filter @s57/api reset-password sets a new random one.

current:
  super-admin: 
    Full name (Bangla or as written): ফুটেক এডমিন
    Name in English (optional): FuTech Admin
    Mobile number (01XXXXXXXXX): 01710341677
    Password (at least 8 characters):
    Repeat the password:01710341677
