-- Public notice board: newest public notices of one society (GET /public/notices).
CREATE INDEX "notices_public_idx" ON "notices"("society_id", "publish_at" DESC) WHERE is_public;
