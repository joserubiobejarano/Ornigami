import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { loadTs } from "./a02-test-support.mts";

const root = process.cwd();
const binDir = process.env.A09_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.PG_BIN;
const pgExe = (name: string) => process.platform === "win32"
  ? join(binDir ?? "C:/Program Files/PostgreSQL/17/bin", `${name}.exe`)
  : binDir ? join(binDir, name) : name;
const port = 55409;
const execFileAsync = promisify(execFile);
function psql(query: string): string {
  return execFileSync(pgExe("psql"), ["-X","-q","-A","-t","-F","|","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-c",query], { encoding: "utf8" }).trim();
}
function psqlFile(path: string): string {
  return execFileSync(pgExe("psql"), ["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-f",path], { encoding: "utf8" }).trim();
}
async function psqlAsync(query: string): Promise<string> {
  const result = await execFileAsync(pgExe("psql"), ["-X","-q","-A","-t","-F","|","-v","ON_ERROR_STOP=1","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-c",query], { encoding: "utf8" });
  return result.stdout.trim();
}
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
const owner = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000004";
const uuid = () => `00000000-0000-4000-8000-${Math.floor(Math.random()*1e12).toString().padStart(12,"0")}`;

test("A09 schema functions preserve human drafts and serialize saves, generation, usage and posting", async () => {
  const testRoot = resolve(root, ".next");
  mkdirSync(testRoot, { recursive: true });
  const dir = mkdtempSync(join(testRoot, "a09-review-pg-"));
  assert.ok(resolve(dir).startsWith(`${testRoot}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D",dataDir,"-U","postgres","-A","trust","--no-locale","--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir,"postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D",dataDir,"-l",join(dir,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port} -F`,"-w","start"], { stdio: "ignore" });
    started = true;
    psql(`CREATE TABLE public.users(id uuid PRIMARY KEY);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES public.users(id), review_replies_used integer DEFAULT 0,
        review_replies_usage_period_start timestamptz, auto_reply_all_reviews boolean DEFAULT false, updated_at timestamptz DEFAULT now());
      CREATE TABLE public.businesses(id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES public.users(id));
      CREATE TABLE public.business_agents(business_id uuid, agent_id text, status text, billing_period text,
        current_period_start timestamptz, current_period_end timestamptz, activated_at timestamptz);
      CREATE TABLE public.reviews(id bigserial PRIMARY KEY,user_id uuid,business_id uuid NOT NULL,google_review_id text NOT NULL,
        status text,reply_comment text,reply_update_time timestamptz,star_rating integer,updated_at timestamptz DEFAULT now(), UNIQUE(business_id,google_review_id));
      CREATE TABLE public.review_replies(id bigserial PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.users(id),
        business_id uuid NOT NULL,review_id bigint NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
        draft_markdown text NOT NULL,posted boolean NOT NULL DEFAULT false,posted_at timestamptz,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO public.users VALUES ('${owner}'),('${actor}');
      INSERT INTO public.profiles(id,review_replies_used,review_replies_usage_period_start,auto_reply_all_reviews)
        VALUES ('${owner}',0,'2026-01-01T00:00:00Z',false);
      INSERT INTO public.businesses VALUES ('${business}','${owner}');
      INSERT INTO public.business_agents(business_id,agent_id,status,billing_period,current_period_start,current_period_end,activated_at)
        VALUES ('${business}','review_replies','active','monthly','2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO public.reviews(user_id,business_id,google_review_id,status,star_rating)
        VALUES ('${owner}','${business}','legacy','new',3),('${owner}','${business}','fresh','new',5),('${owner}','${business}','late','new',5),
          ('${owner}','${business}','post','new',2),('${owner}','${business}','generated','new',5),('${owner}','${business}','unknown','new',NULL),
          ('${owner}','${business}','lease','new',5),
          ('${owner}','${business}','missing-period','new',4),('${owner}','${business}','wrapper','new',NULL);
      INSERT INTO public.review_replies(user_id,business_id,review_id,draft_markdown,posted)
        SELECT '${owner}','${business}',id,'keep human words',false FROM public.reviews WHERE google_review_id='legacy';`);
    const migration = join(root,"docs/tasks/A09-draft-schema.sql");
    psqlFile(migration);
    psqlFile(migration);

    assert.equal(psql(`SELECT state||':'||version||':'||(SELECT draft_markdown FROM public.review_replies WHERE id=s.reply_id)
      FROM public.review_reply_draft_state s JOIN public.reviews r ON r.id=s.review_id WHERE r.google_review_id='legacy'`), "human_edited:1:keep human words");
    const save = (text: string) => `SELECT concat_ws(':',ok::text,version::text) FROM public.a09_save_human_reply_draft('${business}','legacy',${q(text)},1)`;
    const concurrent = await Promise.all([psqlAsync(save("human edit A")), psqlAsync(save("human edit B"))]);
    assert.equal(concurrent.filter((x) => x.startsWith("true:")).length, 1, JSON.stringify(concurrent));
    assert.equal(psql(`SELECT count(*) FROM public.review_replies WHERE review_id=(SELECT id FROM public.reviews WHERE google_review_id='legacy') AND draft_markdown='keep human words'`), "1");

    psql(`UPDATE public.profiles SET review_replies_used=1999 WHERE id='${owner}';`);
    const reserves = await Promise.all([uuid(),uuid()].map((id) => psqlAsync(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${id}')`)));
    assert.equal(reserves.filter((x) => x === "t").length, 1, "concurrent reservations must not exceed the 2000 cap");
    assert.equal(psql(`SELECT review_replies_reserved FROM public.profiles WHERE id='${owner}'`), "1");
    const reservedId = psql(`SELECT id FROM public.review_reply_usage_reservations WHERE state='reserved' LIMIT 1`);
    assert.equal(psql(`SELECT public.a09_finish_reply_usage('${reservedId}',NULL)`),"f","null commit intent must fail closed");
    assert.equal(psql(`SELECT state FROM public.review_reply_usage_reservations WHERE id='${reservedId}'`),"reserved");
    assert.equal(psql(`SELECT public.a09_finish_reply_usage('${reservedId}',false)`), "t");
    assert.equal(psql(`SELECT review_replies_used||':'||review_replies_reserved FROM public.profiles WHERE id='${owner}'`), "1999:0");
    const expiredRequest=uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${expiredRequest}')`),"t");
    psql(`UPDATE public.review_reply_usage_reservations SET expires_at=now()-INTERVAL '1 second' WHERE request_id='${expiredRequest}';`);
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_reserve_reply_usage('${actor}','${business}','${expiredRequest}')`),"false:expired");
    assert.equal(psql(`SELECT review_replies_reserved FROM public.profiles WHERE id='${owner}'`),"0");

    const firstLeaseToken=uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','lease','${firstLeaseToken}')`),/^true:1$/);
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_claim_reply_generation('${business}','lease','${uuid()}')`),"false:busy");
    const leaseRequest=uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${leaseRequest}',
      (SELECT id FROM public.reviews WHERE google_review_id='lease'),'${firstLeaseToken}',1)`),"t");
    psql(`UPDATE public.review_reply_draft_state SET generation_lease_until=now()-INTERVAL '1 second'
      WHERE review_id=(SELECT id FROM public.reviews WHERE google_review_id='lease');`);
    const secondLeaseToken=uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','lease','${secondLeaseToken}')`),/^true:2$/);
    const leaseReservation=psql(`SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${leaseRequest}'`);
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_save_generated_reply('${business}','lease','late first output','${firstLeaseToken}',1,'${leaseReservation}')`),"false:stale-claim");
    assert.equal(psql(`SELECT public.a09_finish_reply_usage('${leaseReservation}',false)`),"t");

    const token = uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','fresh','${token}')`), /^true:1$/);
    const generationReservation = uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${generationReservation}',
      (SELECT id FROM public.reviews WHERE google_review_id='fresh'),'${token}',1)`), "t");
    const humanRace = psql(`SELECT ok||':'||version FROM public.a09_save_human_reply_draft('${business}','fresh','human wins',0)`);
    assert.equal(humanRace, "true:1");
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_save_generated_reply('${business}','fresh','late AI','${token}',1,
      (SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${generationReservation}'))`), "false:stale-claim");
    psql(`SELECT public.a09_finish_reply_usage((SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${generationReservation}'),false)`);
    assert.equal(psql(`SELECT draft_markdown FROM public.review_replies WHERE review_id=(SELECT id FROM public.reviews WHERE google_review_id='fresh') ORDER BY id DESC LIMIT 1`), "human wins");

    const lateToken = uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','late','${lateToken}')`), /^true:1$/);
    const lateRequest = uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${lateRequest}',
      (SELECT id FROM public.reviews WHERE google_review_id='late'),'${lateToken}',1)`), "t");
    psql(`UPDATE public.business_agents SET current_period_start='2026-02-01T00:00:00Z',current_period_end='2026-03-01T00:00:00Z' WHERE business_id='${business}';`);
    const nextRequest=uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${nextRequest}')`), "t");
    assert.equal(psql(`SELECT review_replies_used||':'||review_replies_reserved FROM public.profiles WHERE id='${owner}'`), "0:1");

    const newRequest = psql(`SELECT request_id FROM public.review_reply_usage_reservations WHERE business_id='${business}' AND state='reserved' ORDER BY created_at DESC LIMIT 1`);
    assert.equal(psql(`SELECT public.a09_finish_reply_usage((SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${newRequest}'),false)`),"t");
    const generatedToken=uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','generated','${generatedToken}')`),/^true:1$/);
    const generatedRequest=uuid();
    const generatedReview=psql(`SELECT id FROM public.reviews WHERE google_review_id='generated'`);
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${generatedRequest}','${generatedReview}','${generatedToken}',1)`),"t");
    const generatedReservation=psql(`SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${generatedRequest}'`);
    assert.equal(psql(`SELECT ok||':'||version||':'||state FROM public.a09_save_generated_reply('${business}','generated','AI draft','${generatedToken}',1,'${generatedReservation}')`),"true:1:ai_drafted");
    assert.equal(psql(`SELECT review_replies_used||':'||review_replies_reserved FROM public.profiles WHERE id='${owner}'`),"1:0");
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_save_generated_reply('${business}','generated','again','${generatedToken}',1,'${generatedReservation}')`),"false:stale-claim");
    assert.equal(psql(`SELECT ok FROM public.a09_claim_reply_generation('${business}','generated','${uuid()}')`),"f","existing generated draft must block repeat generation");

    const unknownToken=uuid();
    assert.match(psql(`SELECT ok||':'||fence FROM public.a09_claim_reply_generation('${business}','unknown','${unknownToken}')`),/^true:1$/);
    const unknownRequest=uuid();
    const unknownReview=psql(`SELECT id FROM public.reviews WHERE google_review_id='unknown'`);
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${unknownRequest}','${unknownReview}','${unknownToken}',1)`),"t");
    const unknownReservation=psql(`SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${unknownRequest}'`);
    assert.equal(psql(`SELECT ok||':'||version||':'||state FROM public.a09_save_generated_reply('${business}','unknown','Unknown rating draft','${unknownToken}',1,'${unknownReservation}')`),"true:1:ai_drafted");
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','unknown','Unknown rating draft',1,'automatic','${uuid()}')`),"false:approval-required","an AI draft with unknown rating cannot auto-post");

    const generatedId=psql(`SELECT id FROM public.reviews WHERE google_review_id='generated'`);
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','generated','AI draft',1,'automatic','${uuid()}')`),"false:approval-required","owner opt-in is required for automatic posting");
    psql(`UPDATE public.profiles SET auto_reply_all_reviews=true WHERE id='${owner}';`);
    psql(`DELETE FROM public.business_agents WHERE business_id='${business}' AND agent_id='review_replies';`);
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','generated','AI draft',1,'automatic','${uuid()}')`),"false:approval-required","missing entitlement fails closed");
    psql(`INSERT INTO public.business_agents(business_id,agent_id,status,billing_period,current_period_start,current_period_end,activated_at)
      VALUES ('${business}','review_replies','active','monthly','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z','2026-01-01T00:00:00Z');`);
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','generated','AI draft',1,'automatic','${uuid()}')`),"true:");
    const autoToken=psql(`SELECT posting_token FROM public.review_reply_draft_state WHERE review_id='${generatedId}'`);
    assert.equal(psql(`SELECT public.a09_finish_reply_post('${business}','generated','AI draft','${autoToken}',true)`),"t");
    assert.equal(psql(`SELECT state||':'||status FROM public.review_reply_draft_state s JOIN public.reviews r ON r.id=s.review_id WHERE r.google_review_id='generated'`),"posted:replied");
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','fresh','human wins',1,'automatic','${uuid()}')`),"false:conflict","human-edited high-rating draft still requires manual posting");
    assert.equal(psql(`SELECT ok FROM public.a09_claim_reply_post('${business}','fresh','human wins',1,'manual','${uuid()}')`),"t");
    const uncertainReview=psql(`SELECT id FROM public.reviews WHERE google_review_id='fresh'`);
    psql(`UPDATE public.review_reply_draft_state SET posting_lease_until=now()-INTERVAL '1 second' WHERE review_id='${uncertainReview}';`);
    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','fresh','human wins',1,'manual','${uuid()}')`),"false:conflict","expired uncertain post fence must not permit a duplicate retry");

    const manualReview=psql(`SELECT id FROM public.reviews WHERE google_review_id='post'`);
    assert.equal(psql(`SELECT ok||':'||version FROM public.a09_save_human_reply_draft('${business}','post','human low rating reply',0)`),"true:1");
    assert.equal(psql(`SELECT ok||':'||reason FROM public.a09_claim_reply_post('${business}','post','human low rating reply',1,'automatic','${uuid()}')`),"false:approval-required");
    const firstManualToken=psql(`SELECT token FROM public.a09_claim_reply_post('${business}','post','human low rating reply',1,'manual','${uuid()}')`);
    assert.ok(firstManualToken);
    assert.equal(psql(`SELECT public.a09_finish_reply_post('${business}','post','human low rating reply','${firstManualToken}',false)`),"t");
    assert.equal(psql(`SELECT ok||':'||(token IS NOT NULL) FROM public.a09_claim_reply_post('${business}','post','human low rating reply',1,'manual','${uuid()}')`),"true:true","known provider rejection releases the post fence for explicit retry");
    const manualToken=psql(`SELECT posting_token FROM public.review_reply_draft_state WHERE review_id='${manualReview}'`);
    assert.equal(psql(`SELECT public.a09_finish_reply_post('${business}','post','human low rating reply','${manualToken}',true)`),"t");
    assert.equal(psql(`SELECT status FROM public.reviews WHERE google_review_id='post'`),"replied");

    assert.equal(psql(`SELECT ok||':'||COALESCE(reason,'') FROM public.a09_claim_reply_post('${business}','unknown','x',0,'automatic','${uuid()}')`),"false:approval-required");

    psql(`UPDATE public.review_reply_usage_reservations SET state='released',finalized_at=now() WHERE owner_user_id='${owner}' AND state='reserved';
      UPDATE public.business_agents SET current_period_start=NULL,current_period_end=NULL,activated_at=NULL WHERE business_id='${business}';
      UPDATE public.profiles SET review_replies_used=10,review_replies_reserved=0,review_replies_usage_period_start=NULL WHERE id='${owner}';`);
    const missingPeriod=await Promise.all([uuid(),uuid()].map((id)=>psqlAsync(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${id}')`)));
    assert.deepEqual(missingPeriod,["t","t"]);
    assert.equal(psql(`SELECT review_replies_used||':'||review_replies_reserved FROM public.profiles WHERE id='${owner}'`),"10:2");
    assert.equal(psql(`SELECT count(DISTINCT usage_period_start) FROM public.review_reply_usage_reservations WHERE owner_user_id='${owner}' AND state='reserved'`),"1");
    psql(`UPDATE public.profiles SET review_replies_used=10 WHERE id='${owner}';
      UPDATE public.business_agents SET current_period_start='2025-12-01T00:00:00Z',current_period_end=NULL WHERE business_id='${business}';`);
    const backwards=uuid();
    assert.equal(psql(`SELECT ok FROM public.a09_reserve_reply_usage('${actor}','${business}','${backwards}')`),"t");
    assert.equal(psql(`SELECT review_replies_used FROM public.profiles WHERE id='${owner}'`),"10","older business period must not reset the owner profile counter");
    assert.equal(psql(`SELECT review_replies_reserved FROM public.profiles WHERE id='${owner}'`),"3","active reservations share the stable owner period");

    const render = (strings: TemplateStringsArray, values: unknown[]) => strings.reduce((query, part, index) => {
      if (index >= values.length) return query + part;
      const value=values[index];
      const literal=value===null||value===undefined?"NULL":typeof value==="number"?String(value):typeof value==="boolean"?(value?"TRUE":"FALSE"):`'${String(value).replaceAll("'","''")}'`;
      return query+part+literal;
    },"");
    const policy=loadTs<typeof import("../src/lib/review-draft-policy.js")>("src/lib/review-draft-policy.ts",{
      "@/lib/db/neon":{sql:(strings:TemplateStringsArray,...values:unknown[])=>{
        const query=render(strings,values);
        const json=psql(`SELECT COALESCE(json_agg(row_to_json(a)),'[]'::json)::text FROM (${query}) a`);
        return Promise.resolve(JSON.parse(json) as unknown[]);
      }},
      "@/lib/business-context":{resolveBusinessContext:async()=>({businessId:business,usageOwnerUserId:owner})},
    });
    const legacyDraft=await policy.getReplyDraft(business,"legacy");
    assert.equal(legacyDraft?.state,"human_edited");
    assert.equal(legacyDraft?.version,2);
    assert.ok(["human edit A","human edit B"].includes(legacyDraft?.reply ?? ""));
    assert.equal(psql(`SELECT count(*) FROM public.review_replies WHERE review_id=(SELECT id FROM public.reviews WHERE google_review_id='legacy')`),"2","prior legacy text remains preserved alongside the new saved version");
    const wrappedSave=await policy.saveHumanReplyDraft(business,"wrapper"," \twrapper text\n ",0);
    assert.equal(wrappedSave.ok,true);
    if(wrappedSave.ok){assert.equal(wrappedSave.draft.reply,"wrapper text");assert.equal(wrappedSave.draft.version,1);}
    assert.equal((await policy.getReplyDraft(business,"wrapper"))?.reply,"wrapper text");
    assert.deepEqual(await policy.claimReplyGeneration(actor,business,"wrapper"),{ok:false,reason:"existing-draft"});
    const genericReservation=await policy.reserveReviewReplyUsage(actor,business,uuid());
    assert.equal(genericReservation.ok,true);
    if(genericReservation.ok){assert.equal(await policy.commitReviewReplyUsage(genericReservation.reservationId),true);}
    assert.equal(psql(`SELECT public.a09_finish_reply_usage((SELECT id FROM public.review_reply_usage_reservations WHERE request_id='${lateRequest}'),true)`), "f");
    assert.equal(psql(`SELECT review_replies_used||':'||review_replies_reserved FROM public.profiles WHERE id='${owner}'`), "11:3");

  } finally {
    if (started) execFileSync(pgExe("pg_ctl"), ["-D",dataDir,"-m","immediate","-w","stop"], { stdio: "ignore" });
    if (existsSync(dir)) rmSync(dir,{recursive:true,force:true});
  }
});
