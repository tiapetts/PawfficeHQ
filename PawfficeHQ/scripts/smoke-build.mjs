import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve("dist");
const requiredPages=["index.html","privacy.html","terms.html","contact.html","support.html","robots.txt","sitemap.xml"];
await Promise.all(requiredPages.map(file=>access(resolve(root,file))));
const html=await readFile(resolve(root,"index.html"),"utf8");
if(!html.includes('id="root"'))throw new Error("Built app is missing its React root");
if(!html.match(/assets\/[^\"']+\.js/))throw new Error("Built app is missing a JavaScript bundle");
console.log(`Production smoke test passed (${requiredPages.length} public entry points checked).`);
