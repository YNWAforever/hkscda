import { SQL } from "bun";
import { expect, test } from "bun:test";
import { PUBLIC_ANIMAL_COLUMNS } from "./publicColumns";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "56322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Only isolated 56322 fixtures are allowed");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "FIX-01 anonymous database access excludes internal notes but retains published fostered records",
  async () => {
    const db = new SQL(url!, { max: 1 });
    try {
      expect(
        (
          await db`select has_column_privilege('anon','public.animals','notes','SELECT') as allowed`
        )[0].allowed,
      ).toBe(false);
      expect(
        (
          await db`select has_column_privilege('anon','public.animals','notes_en','SELECT') as allowed`
        )[0].allowed,
      ).toBe(false);
      await db.begin(async (tx) => {
        const id = crypto.randomUUID();
        await tx`insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible,notes,notes_en) values(${id}::uuid,'cat','Synthetic privacy animal','female','2 歲','fostered','published',true,true,'SYNTHETIC_INTERNAL_MARKER','SYNTHETIC_INTERNAL_MARKER_EN')`;
        await tx.unsafe("set local role anon");
        const rows = await tx.unsafe(
          `select ${PUBLIC_ANIMAL_COLUMNS} from public.animals where id=$1::uuid`,
          [id],
        );
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows)).not.toContain("SYNTHETIC_INTERNAL_MARKER");
        await tx.unsafe("reset role");
        await tx`update public.animals set publication_state='unpublished' where id=${id}::uuid`;
        await tx.unsafe("set local role anon");
        expect(await tx`select id from public.animals where id=${id}::uuid`).toHaveLength(0);
        await tx.unsafe("reset role");
        await tx`delete from public.animals where id=${id}::uuid`;
      });
    } finally {
      await db.close();
    }
  },
);
