// Read-only GitHub API download. No code from the reference is executed.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const run=promisify(execFile), root='D:/Ai_RedTool/red_skiing', commit='2f820ca3f9e376d47be66d179da2f912df9ff4b9';
const api=async route=>JSON.parse((await run('gh',['api',route],{maxBuffer:40*1024*1024})).stdout);
const tree=await api(`repos/huiskylabs/cold-smoke/git/trees/${commit}?recursive=1`);
if(tree.truncated)throw new Error('Incomplete GitHub tree');
const entries=tree.tree.filter(f=>f.type==='blob');
const hash=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
let cursor=0,done=0;
await mkdir(root,{recursive:true});
await writeFile(path.join(root,'REFERENCE-SNAPSHOT.json'),JSON.stringify({repository:'https://github.com/huiskylabs/cold-smoke',commit,files:entries.map(f=>({path:f.path,size:f.size,sha:f.sha})),status:'downloading'},null,2));
await Promise.all(Array.from({length:6},async()=>{while(cursor<entries.length){const f=entries[cursor++],dest=path.resolve(root,f.path);if(!dest.startsWith(path.resolve(root)+path.sep))throw new Error('Invalid path');let exists;try{exists=await readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
if(exists){if(hash(exists)!==f.sha)throw new Error('Existing file differs: '+f.path);}else{let blob;for(let retry=0;retry<3;retry++){try{blob=await api(`repos/huiskylabs/cold-smoke/git/blobs/${f.sha}`);break;}catch(e){if(retry===2)throw e;}}const bytes=Buffer.from(blob.content,blob.encoding);if(hash(bytes)!==f.sha)throw new Error('Hash mismatch: '+f.path);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);}
done++;if(done%20===0)process.stdout.write(`Verified ${done}/${entries.length} files\n`);}}));
await writeFile(path.join(root,'REFERENCE-SNAPSHOT.json'),JSON.stringify({repository:'https://github.com/huiskylabs/cold-smoke',commit,status:'verified',files:entries.map(f=>({path:f.path,size:f.size,sha:f.sha}))},null,2));
process.stdout.write(`Complete source snapshot: ${entries.length} files, all Git blob hashes verified.\n`);
