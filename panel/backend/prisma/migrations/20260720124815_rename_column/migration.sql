--
ALTER TABLE "users" RENAME COLUMN "t_id" TO "id";
ALTER SEQUENCE "users_t_id_seq" RENAME TO "users_id_seq";

--
ALTER TABLE "user_traffic" RENAME COLUMN "t_id" TO "id";
ALTER TABLE "user_traffic" RENAME CONSTRAINT "user_traffic_t_id_fkey" TO "user_traffic_id_fkey";
