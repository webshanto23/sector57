-- A published album can stay off the public gallery page, e.g. one made for the home slider.
ALTER TABLE "gallery_albums" ADD COLUMN "hide_from_gallery" BOOLEAN NOT NULL DEFAULT false;
