-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "uid" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'free',
    "points" INTEGER NOT NULL DEFAULT 0,
    "day" TEXT,
    "created" BIGINT NOT NULL,
    "last_login" BIGINT,
    "used_total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "works" (
    "uid" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updated" BIGINT NOT NULL,

    CONSTRAINT "works_pkey" PRIMARY KEY ("uid","id")
);

-- CreateTable
CREATE TABLE "yqlog" (
    "id" BIGSERIAL NOT NULL,
    "day" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "status" INTEGER NOT NULL,
    "ms" INTEGER NOT NULL,
    "model" TEXT NOT NULL,

    CONSTRAINT "yqlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" BIGSERIAL NOT NULL,
    "uid" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated" BIGINT NOT NULL,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "state_expires" BIGINT NOT NULL,
    "body" TEXT,
    "body_expires" BIGINT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "yqlog_day" ON "yqlog"("day");

-- CreateIndex
CREATE INDEX "yqlog_at" ON "yqlog"("at");

-- CreateIndex
CREATE INDEX "ledger_uid" ON "ledger"("uid", "id");

