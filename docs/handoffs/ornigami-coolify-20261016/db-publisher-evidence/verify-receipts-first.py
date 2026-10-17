import pathlib,json,hashlib,re,datetime,subprocess
base=pathlib.Path('C:/Users/joser/Desktop/Projects/Ornigami-coolify-prep-20261016');p=base/'.local/db-publisher-investigation-20261017'; checks=[]
def checked(name,fn):fn();checks.append({'name':name,'result':'passed'})
def registry():
 raw=(p/'registry-tag-manifest.json').read_bytes();m=json.loads(raw);digest='sha256:'+hashlib.sha256(raw).hexdigest();assert digest=='sha256:9dd4076bb4c826ace2a305983a2285de1044fbf99d27eb619b91abc4dfc1b43c';assert raw==(p/'registry-digest-manifest.json').read_bytes();assert len(raw)==616;assert m['mediaType']=='application/vnd.oci.image.manifest.v1+json';assert m['annotations']['org.opencontainers.image.created']=='2026-10-16T01:20:52Z';assert m['layers'][0]['digest']=='sha256:21c41a540cbf645dc6f754e5dd54e0c44efafc4e4085315b4dd51e63ed88feb5';assert m['layers'][0]['size']==134244714;assert len(m['layers'])==1 and 'manifests' not in m
 for req in json.loads((p/'REGISTRY_REQUESTS.json').read_text()):
  assert '/manifests/' in req['url'] and req['method'] in ['HEAD','GET'];assert '/blobs/' not in req['url'];assert req['bytes']<=262144
  if req['status']==200:assert req['headers']['docker-content-digest']==digest
 assert json.loads((p/'FINAL_OBSERVATION.json').read_text())['registry']['headers']['docker-content-digest']==digest
checked('manifest hash/header/immutable bytes; no index or blob body requests',registry)
def publisher():
 runs=json.loads((p/'publisher-runs.json').read_text())['workflow_runs'];assert len(runs)>=7
 for r in runs[:6]:
  assert r['conclusion']=='failure' and r['head_sha']=='cbebf2ecd6df42d36463844a45e689afee51c70f';jobs=json.loads((p/f"publisher-{r['id']}-jobs.json").read_text())['jobs'];assert len(jobs)==1;steps={s['name']:s['conclusion'] for s in jobs[0]['steps']};assert steps['Build database']=='failure' and steps['Upload assets to registries']=='skipped'
 assert runs[6]['id']==38828255551 and runs[6]['conclusion']=='success'
 log=(p/'publisher-last-successful-log-tail.txt').read_text();assert re.search(r'Pushed \[registry\] ghcr.io/[^\n]+/trivy-db:2\n[^\n]+Digest: sha256:9dd4076bb4c826ace2a305983a2285de1044fbf99d27eb619b91abc4dfc1b43c',log)
 for label in ['first-failed','pretrial-failed','latest-failed']:
  log=(p/f'publisher-{label}-log-tail.txt').read_text();assert 'upstream_version must start with digit' in log and 'package_name: zziplib' in log and 'vuln_id: CVE-2026-111142' in log and 'sid_ver: undetermined' in log
 for receipt in json.loads((p/'PUBLISHER_LOG_RECEIPTS.json').read_text())+json.loads((p/'PUBLISHER_PRIOR_LOG_RECEIPTS.json').read_text()):assert receipt['commandExit']==0 and receipt['retainedBodyBytes']==int(receipt['actualHeaders']['content-length']) and receipt['retainedBodyBytes']<131072
checked('six failed publishers, skipped uploads, last success/current digest linkage and three direct error logs',publisher)
def provenance():
 for r in json.loads((p/'SOURCE_RECEIPTS.json').read_text()):assert hashlib.sha256((p/r['file']).read_bytes()).hexdigest()==r['sha256'];assert r['bytes']<=65536
 old=json.loads((base/'.local/framework-prototype/ornigami-db-admission-only/scripts/framework-prototype/trivy-metadata-contract.json').read_text())
 new=json.loads((p/'SOURCE_RECEIPTS.json').read_text())
 for a in old['receipts']:
  for b in new:
   if a['repo']==b['repo'] and a['path']==b['path']:assert a['revision']==b['revision'] and a['sha256']==b['sha256']
 for n in [700,701]:
  pr=json.loads((p/f'publisher-pr-{n}.json').read_text());assert pr['merged'] is False and pr['merged_at'] is None and pr['state']=='open'
checked('pinned official source hashes and unmerged proposal identities',provenance)
def retained():
 a=base/'docs/handoffs/ornigami-coolify-20261016/external-db-admission-39032144805/artifact/database-admission';receipt=json.loads((a/'index.json').read_text());raw=(a/'metadata.original.bin').read_bytes();assert hashlib.sha256(raw).hexdigest()==receipt['metadataIdentity']['sha256'];assert receipt['errors']==[{'code':'NextUpdate-expired'}];assert receipt['clock']['epochMs']-receipt['parsedTimestamps']['NextUpdate']['epochMs']==40026389
 count=0;root=base/'docs/handoffs/ornigami-coolify-20261016'
 for name in ['framework-decision-evidence','framework-prototype-evidence','portable-repair-evidence','external-trial-38964204005','external-trial-38976049055','remediation-preparation-evidence','minimal-glibc-evidence','minimal-glibc-admission-evidence','external-trial-39027472379','db-admission-repair-evidence','db-admission-only-evidence','external-db-admission-39032144805']:
  data=json.loads((root/name/'SHA256SUMS.json').read_text());files=data['files'] if 'files' in data else [{'path':k,'sha256':v} for k,v in data.items()]
  for f in files:assert hashlib.sha256((root/name/f['path']).read_bytes()).hexdigest()==f['sha256'];count+=1
 assert count==916
 (p/'HISTORICAL_PRESERVATION.json').write_text(json.dumps({'result':'passed','files':count,'oldMissingMetadataCause':'still not established'},indent=2)+'\n')
checked('retained rejection remains exact and 916 historical files unchanged',retained)
patterns=[rb'gh[pousr]_[A-Za-z0-9]{20,}',rb'github_pat_[A-Za-z0-9_]{20,}',rb'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----',rb'[?&]sig=[A-Za-z0-9%+/]{8,}']
for f in p.rglob('*'):
 if f.is_file():
  b=f.read_bytes()
  for pat in patterns:assert not re.search(pat,b),(str(f),'credential pattern; do not publish')
checks.append({'name':'credential/signed-redirect patterns not retained','result':'passed'})
(p/'CHECKS.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'scope':'Offline receipt/source/hash analysis only; no scanner, DB download, build or network fixtures. No runtime change or workflow implementation.'},indent=2)+'\n');print(json.dumps({'checks':checks,'historicalFiles':916}))
