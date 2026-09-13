// Full dialog regression. Requires Playwright and the backend Python environment.
// Optional: FORECAST_TEST_URL tests the HTML served by the running frontend.
const fs=require('node:fs'), assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const path=require('node:path');
const root=path.resolve(__dirname,'..'), backend=process.env.FORECAST_BACKEND_DIR || path.resolve(root,'../backend');
const previewScript="import json, sys\nimport pandas as pd\nfrom forecasting.preparation import prepare_observations\nframe=pd.read_excel('forecasting/templates/Missing-Data-Test-Vertical.xlsx')\nframe.columns=['unique_id','ds','y']\ntry:\n    _, review=prepare_observations(frame,json.load(sys.stdin))\n    print(json.dumps({'status':200,'body':review}))\nexcept ValueError as exc:\n    print(json.dumps({'status':400,'body':{'detail':str(exc)}}))\n";
(async()=>{
const html=process.env.FORECAST_TEST_URL ? await (await fetch(process.env.FORECAST_TEST_URL)).text() : fs.readFileSync(path.join(root,'forecaster.html'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const page=await browser.newPage({viewport:{width:1322,height:1165}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
await page.addStyleTag({path:root+'/operartis-tailwind-compat.css'});
for(const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:match[1]});
for(const name of ['react-17.0.2.production.min.js','react-dom-17.0.2.production.min.js','prop-types-15.8.1.min.js','recharts-1.8.5.min.js','babel-standalone-7.26.10.min.js','xlsx-0.18.5.full.min.js'])await page.addScriptTag({path:root+'/vendor/'+name});
for(const name of ['operartis-format.js','forecast-dialog-i18n.js','operartis-security.js'])await page.addScriptTag({path:root+'/'+name});
const policies=[];
await page.exposeFunction('previewPolicy',policy=>{
 policies.push(policy);const result=spawnSync(process.env.FORECAST_TEST_PYTHON || backend+'/.venv/bin/python',['-c',previewScript],{cwd:backend,env:{...process.env,PYTHONPATH:backend},input:JSON.stringify(policy),encoding:'utf8',maxBuffer:5e6});
 if(result.status!==0)throw new Error(result.stderr);return JSON.parse(result.stdout);
});
await page.evaluate(()=>{const original=window.fetch;window.fetch=async(url,options)=>{if(String(url).endsWith('/data/preview')){const result=await window.previewPolicy(JSON.parse(options.body.get('preparation')));window.lastPreview=result.body;if(window.pausePreview)await new Promise(resolve=>window.releasePreview=resolve);return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});}return original(url,options);};});
const workbook=fs.readFileSync(backend+'/forecasting/templates/Missing-Data-Test-Vertical.xlsx').toString('base64');
const script=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1].replace("ReactDOM.render(<App />, document.getElementById('root'));",`window.mountDialog=(preparation={})=>{const bytes=Uint8Array.from(atob('${workbook}'),c=>c.charCodeAt(0));const file=new File([bytes],'Missing-Data-Test-Vertical.xlsx');const data=readForecastUpload(XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true,raw:true}),'vertical');const t=key=>key.split('.').reduce((v,k)=>v?.[k],TRANSLATIONS.en)||key;t.numberLocale='en-US';ReactDOM.unmountComponentAtNode(document.getElementById('root'));ReactDOM.render(<MappingModal initialSource={{...data,file,mode:'custom',preparation}} baseUrl="http://test" t={t} onClose={()=>{}} onConfirm={(...args)=>{window.confirmedSource=args[3];}}/>,document.getElementById('root'));};window.mountDialog();`);
await page.evaluate(code=>eval(Babel.transform(code,{presets:['react']}).code),script);

await page.locator('.fc-missing-frequency select').waitFor({state:'attached'});
const missing=page.locator('.fc-source-foldout').filter({has:page.locator('.fc-missing-workspace')});
await missing.locator(':scope > summary').click();
await page.getByRole('button',{name:'Review items (10)',exact:true}).click();

for(const id of ['TEST-001','TEST-002','TEST-003','TEST-004','TEST-005','TEST-006','TEST-007','TEST-008','TEST-009','TEST-010']) {
 const card=page.locator('.fc-prep-item').filter({hasText:id});
 const requests=policies.length;
 await card.getByRole('button',{name:'Preview',exact:true}).click();
 const cells=await card.locator('.fc-missing-recommendation-table tbody td:last-child').allTextContents();
 assert.ok(cells.length>0 && cells.every(value=>value==='Unresolved'));
 assert.equal(policies.length,requests,'Opening Preview must not change handling');
 await card.getByRole('button',{name:'Hide preview',exact:true}).click();
}
const item=page.locator('.fc-prep-item').filter({hasText:'TEST-001'});
await item.getByRole('button',{name:'Preview',exact:true}).click();
assert.equal(await item.getByRole('button',{name:'Apply suggestion',exact:true}).count(),0);
const values=()=>item.locator('.fc-missing-recommendation-table tbody td:last-child').allTextContents();
for(const method of ['interpolation','forward','zero','none']) {
 await item.getByRole('combobox',{name:'Handling for TEST-001',exact:true}).selectOption(method);
 await page.waitForFunction(method=>window.lastPreview?.policy?.overrides?.['TEST-001']===method && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'),method);
 const expected=await page.evaluate(method=>window.lastPreview.records.filter(r=>r.unique_id==='TEST-001' && r.missing).map(r=>method==='none'||r.prepared==null?'Unresolved':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(r.prepared)),method);
 assert.deepEqual(await values(),expected);
 assert.equal(await item.getByRole('button',{name:'Hide preview',exact:true}).count(),1,'Preview stays open across method changes');
}
await page.evaluate(()=>window.pausePreview=true);
await item.getByRole('combobox',{name:'Handling for TEST-001',exact:true}).selectOption('backward');
await page.waitForFunction(()=>typeof window.releasePreview==='function');
assert.deepEqual(await values(),['—','—'],'Do not display stale estimates while updating');
await page.evaluate(()=>{window.pausePreview=false;window.releasePreview();});
await page.waitForFunction(()=>!document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.ok((await values()).every(value=>value!=='—' && value!=='Unresolved'));
for(const width of [1322,426]) {
 await page.setViewportSize({width,height:1165});
 assert.ok(await item.locator('.fc-missing-recommendation').evaluate(el=>el.scrollWidth<=el.clientWidth));
 await item.screenshot({path:`/tmp/applied-handling-preview-${width}.png`});
}
const intermittent=page.locator('.fc-prep-item').filter({hasText:'TEST-007'});
assert.equal(await intermittent.getByText('No method suggested',{exact:true}).count(),1);
await intermittent.getByRole('button',{name:'Preview',exact:true}).click();
await intermittent.getByRole('combobox',{name:'Handling for TEST-007',exact:true}).selectOption('zero');
await page.waitForFunction(()=>window.lastPreview?.policy?.overrides?.['TEST-007']==='zero' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.deepEqual(await intermittent.locator('.fc-missing-recommendation-table tbody td:last-child').allTextContents(),['0','0','0','0']);
// Mix per-date methods without changing the ID default or another ID.
await page.setViewportSize({width:1322,height:1165});
const mixed=page.locator('.fc-prep-item').filter({hasText:'TEST-003'});
await mixed.getByRole('button',{name:'Preview',exact:true}).click();
await mixed.getByRole('combobox',{name:'Handling for TEST-003',exact:true}).selectOption('seasonal');
await page.waitForFunction(()=>window.lastPreview?.policy?.overrides?.['TEST-003']==='seasonal' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
const dateRows=mixed.locator('.fc-missing-recommendation-table tbody tr');
const dates=await page.evaluate(()=>window.lastPreview.records.filter(r=>r.unique_id==='TEST-003' && r.missing).map(r=>r.ds));
assert.equal(dates.length,3);
assert.deepEqual(await dateRows.getByRole('combobox').evaluateAll(elements=>elements.map(el=>el.value)),['seasonal','seasonal','seasonal']);
assert.equal(await mixed.getByRole('option',{name:'Use ID handling',exact:true}).count(),0);
for(const [index,method] of [[0,'forward'],[1,'interpolation']]) {
 await dateRows.nth(index).getByRole('combobox').selectOption(method);
 await page.waitForFunction(({date,method})=>window.lastPreview?.policy?.value_overrides?.['TEST-003']?.[date]===method && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'),{date:dates[index],method});
}
assert.deepEqual(await page.evaluate(()=>window.lastPreview.records.filter(r=>r.unique_id==='TEST-003' && r.missing).map(r=>r.method)),['forward','interpolation','seasonal']);
assert.equal(await mixed.getByRole('combobox',{name:'Handling for TEST-003',exact:true}).inputValue(),'individual');
assert.deepEqual(await dateRows.getByRole('combobox').evaluateAll(elements=>elements.map(el=>el.value)),['forward','interpolation','seasonal']);
assert.equal(await mixed.locator('.fc-source-error').count(),0);
assert.equal(await mixed.getByText('Handled',{exact:true}).count(),1);
for(const width of [1322,426]) {
 await page.setViewportSize({width,height:1165});
 assert.ok(await mixed.locator('.fc-missing-recommendation').evaluate(el=>el.scrollWidth<=el.clientWidth));
 await mixed.screenshot({path:`/tmp/value-handling-${width}.png`});
}
await dateRows.nth(0).getByRole('combobox').selectOption('none');
await page.waitForFunction(date=>window.lastPreview?.policy?.value_overrides?.['TEST-003']?.[date]==='none' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'),dates[0]);
assert.equal(await dateRows.nth(0).locator('td:last-child').textContent(),'Unresolved');
await dateRows.nth(0).getByRole('combobox').selectOption('seasonal');
await page.waitForFunction(date=>window.lastPreview?.policy?.value_overrides?.['TEST-003'] && window.lastPreview.policy.value_overrides['TEST-003'][date]==='seasonal' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'),dates[0]);
assert.equal(await dateRows.nth(0).getByRole('combobox').inputValue(),'seasonal');
const itemHandling=mixed.getByRole('combobox',{name:'Handling for TEST-003',exact:true});
assert.equal(await itemHandling.inputValue(),'individual','Different row methods show Individually');
await dateRows.nth(1).getByRole('combobox').selectOption('seasonal');
await page.waitForFunction(()=>!document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.equal(await itemHandling.inputValue(),'seasonal','Matching rows show their common method even with explicit overrides');
await dateRows.nth(0).getByRole('combobox').selectOption('none');
await page.waitForFunction(()=>!document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.equal(await itemHandling.inputValue(),'individual','Leave unresolved is also an individual override');
for(let index=0;index<3;index++) {
 await dateRows.nth(index).getByRole('combobox').selectOption('forward');
 await page.waitForFunction(({date})=>window.lastPreview?.policy?.value_overrides?.['TEST-003']?.[date]==='forward' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'),{date:dates[index]});
}
assert.equal(await itemHandling.inputValue(),'forward','All overrides match even though the stored ID default is seasonal');
await itemHandling.selectOption('zero');
await page.waitForFunction(()=>window.lastPreview?.policy?.overrides?.['TEST-003']==='zero' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.deepEqual(await dateRows.getByRole('combobox').evaluateAll(elements=>elements.map(el=>el.value)),['zero','zero','zero']);
assert.deepEqual(await page.evaluate(()=>window.lastPreview.policy.value_overrides['TEST-003']),{});
await itemHandling.selectOption('forward');
await page.waitForFunction(()=>window.lastPreview?.policy?.overrides?.['TEST-003']==='forward' && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.equal(await itemHandling.inputValue(),'forward');
assert.deepEqual(await dateRows.getByRole('combobox').evaluateAll(elements=>elements.map(el=>el.value)),['forward','forward','forward']);
assert.deepEqual(await page.evaluate(()=>window.lastPreview.records.filter(r=>r.unique_id==='TEST-003' && r.missing).map(r=>r.method)),['forward','forward','forward']);
await page.getByRole('button',{name:'Reset handling',exact:true}).click();
await page.waitForFunction(()=>window.lastPreview?.policy?.method==='none' && Object.keys(window.lastPreview?.policy?.value_overrides || {}).length===0 && !document.querySelector('.fc-missing-recommendation-preview[aria-busy="true"]'));
assert.deepEqual(await mixed.locator('.fc-missing-recommendation-table tbody td:last-child').allTextContents(),['Unresolved','Unresolved','Unresolved']);
assert.deepEqual(errors,[]);
console.log('PASS: applied previews, per-date mixed methods, unresolved overrides, actual row methods, common-method summary, apply-to-all, reset, backend values and desktop/mobile fit.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
