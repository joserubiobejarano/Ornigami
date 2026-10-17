import json,pathlib,hashlib,collections,re,os
root=pathlib.Path(__file__).resolve().parent;r=root/'artifact';j=lambda p:json.loads((r/p).read_text())
m=j('manifest.json');src='f6e26a1fc91826d760acc75c8bfa9612564115d6';assert m['source_sha']==src and m['capture_completeness_status']=='passed'
rows=[];scopes=[]
for s in j('stage-scans/index.json')['stages']:
 st=s['stage'];d=j(f'stage-scans/{st}/scan/{st}/trivy.json');counts=collections.Counter(v['Severity'] for x in d.get('Results',[]) for v in (x.get('Vulnerabilities') or []));assert dict(counts)==s['scanResult']['counts'];assert s['collectionComplete']
 for scope in s['resources']:
  assert scope['limitsVerified'] and scope['resourceResult']=='passed';a=scope['after'];assert a['memory.max']=='2147483648' and a['memory.swap.max']=='0' and a['cpu.max']=='100000 100000';ev=dict(x.split() for x in a['memory.events'].splitlines());assert all(ev[k]=='0' for k in ['oom','oom_kill','oom_group_kill']);scopes.append(int(a['memory.peak']))
 native=j(f'stage-scans/{st}/filesystem/result.json');closure=j(f'stage-scans/{st}/filesystem/native-closure.json');assert native['result']=='passed' and closure['result']=='passed' and not closure['errors']
 rows.append({'stage':st,'counts':dict(counts),'packages':s['scanResult']['packageCount'],'nativeFiles':native['nativeFiles'],'imageId':s['imageId'],'archiveSha256':s['archiveSha256'],'archiveBytes':s['archiveBytes'],'result':s['result']})
assert len(rows)==9
cache=[]
for st in ['build-base','deps','builder','prod-deps']:
 vertices={}
 for line in (r/f'stage-scans/{st}/cache-export.log').read_text().splitlines():
  for v in json.loads(line).get('vertexes',[]):vertices[v['digest']]={**vertices.get(v['digest'],{}),**v}
 work=[v for v in vertices.values() if re.match(r'^\[.+ \d+/\d+\] (RUN|COPY|ADD|WORKDIR|USER|ENV|SHELL|LABEL|EXPOSE|ENTRYPOINT|CMD)',v['name'])]
 assert work and all(v.get('cached') for v in work),[(v['name'],v.get('cached')) for v in work]
 cache.append({'stage':st,'cachedWorkVertices':len(work),'recompilation':False})
b=j('framework-browser/result/regressions.json');assert len(b['checks'])==9 and all(x['state']=='passed' for x in b['checks']) and b['forbiddenRequests']==[] and b['cleanup']
n=j('runtime/native-image-formats.json');assert n['result']=='passed' and len(n['checks'])==7 and all(x['result']=='passed' for x in n['checks'])
db=j('stage-scans/database-admission/index.json');assert db['result']=='passed' and not db['errors']
report={'sourceSha':src,'requestSha':m['request_sha'],'runId':m['run_id'],'scanRoles':rows,'diagnosticMemoryPressure':'runner filesystem peak 2147483648 bytes and memory.max events 1831; OOM/kill zero; no diagnostic headroom accepted','diagnosticScopes':len(scopes),'diagnosticPeakBytes':max(scopes),'cacheOnlyExports':cache,'browserChecks':[{k:x[k] for k in ['name','state']} for x in b['checks']],'nativeFormats':[x['format'] for x in n['checks']],'databaseValidationClock':db['clock']['utc'],'databaseIdentity':db['databaseIdentity'],'coverageHold':True,'securityAcceptance':False,'retainedImage':False,'runtimeOrigin':'https://rehearsal.invalid','runtimePersistenceScope':'Next image-cache only; no database/media acceptance','resourceAssessment':(r/'runner/resource-assessment.txt').read_text().strip(),'buildObservationSamples':len((r/'runner/full-build-observations.jsonl').read_text().splitlines()),'cleanupScope':'step success; four parent/tool removals explicitly reported; builder/image removals attempted with suppressed shell errors, absence not independently proven'}
p=root/'INDEPENDENT_REVIEW.json'
with p.open('x') as f:json.dump(report,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps({'roles':len(rows),'scopes':len(scopes),'diagnosticPeakBytes':max(scopes),'cacheExports':cache,'browserGroups':9,'formats':7,'securityAccepted':False}))
