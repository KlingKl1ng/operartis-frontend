// Run with Node and Playwright available (set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for a custom browser).
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
const html=fs.readFileSync(root+'/forecaster.html','utf8'),fixture={sku:'CAL-001',validation_data:[],forecast_data:[]};
for(let i=0;i<12;i++){
 const date=`2026-01-${String(i+1).padStart(2,'0')}`,value=i===5?null:100+i;
 const metadata=i===5?{prepared_actual:105,preparation_method:'interpolation'}:{};
 fixture.validation_data.push({date,actual_train:value,fitted:99+i,...metadata});
 fixture.forecast_data.push({date,actual_history:value,final_fit:99+i,...metadata});
}
const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const page=await browser.newPage({viewport:{width:Number(process.env.CHART_TEST_WIDTH)||1000,height:800}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent(`<html class="dark"><style>${css}body{background:#0f172a;color:#e2e8f0;font-family:system-ui;margin:16px}.fc-detail-charts{height:700px!important}.fc-detail-chart{height:330px!important}</style><div id="qa"></div></html>`);
for(const file of ['tailwindcss-3.4.17.js','react-17.0.2.production.min.js','react-dom-17.0.2.production.min.js','prop-types-15.8.1.min.js','recharts-1.8.5.min.js','babel-standalone-7.26.10.min.js'])await page.addScriptTag({path:root+'/vendor/'+file});
await page.addScriptTag({path:root+'/forecast-dialog-i18n.js'});
const translationHook=html.slice(html.indexOf('            const t =',html.indexOf('const App =')),html.indexOf('            const isForecastModelAvailable ='));
const mergeHelper=html.slice(html.indexOf('const equalForecastResult ='),html.indexOf('const getAdaptivePollDelay ='));
const chunks=[mergeHelper,html.slice(html.indexOf('const TRANSLATIONS ='),html.indexOf('const MenuIcon =')),html.slice(html.indexOf('const fmtNumber ='),html.indexOf('const formatEvaluationValue =')),html.slice(html.indexOf('const formatForecastDate ='),html.indexOf('const formatChartAxis =')),html.match(/const formatChartAxis = [\s\S]*?\.format\(value\);/)?.[0],html.match(/const chartPointStyle = .*?;/)[0],html.match(/const PREPARATION_METHODS = .*?;/)[0],html.slice(html.indexOf('const useChartZoom ='),html.indexOf('const AlertModal ='))];
await page.evaluate(({code,fixture,translationHook})=>eval(Babel.transform(`const {useState,useEffect,useMemo,useRef,useCallback,useLayoutEffect,memo}=React;
const {ResponsiveContainer,Area,Line,CartesianGrid,XAxis,YAxis,Tooltip}=Recharts;
window.charts=[];const ComposedChart=props=><Recharts.ComposedChart {...props} ref={c=>{if(c&&!window.charts.includes(c))window.charts.push(c)}}/>;
${code}
window.fixture=${JSON.stringify(fixture)};
const App=()=>{const [lang,setLang]=useState('en'),[dark,setDark]=useState(true),[progress,setProgress]=useState(1),[results,setResults]=useState([window.fixture]);const result=results[0];window.tick=()=>{setResults(previous=>mergeForecastResults(previous,[...JSON.parse(JSON.stringify(previous)),{...window.fixture,sku:'CAL-'+String(previous.length+1)}]));setProgress(p=>p+1)};window.update=(l,d)=>{setLang(l);setDark(d)};window.replaceResult=()=>setResults(previous=>mergeForecastResults(previous,[{...result,forecast_data:result.forecast_data.map(r=>r.actual_history==null?r:{...r,actual_history:r.actual_history+10})}]));
const numberLocaleForLanguage=l=>({en:'en-US',vi:'vi-VN',de:'de-DE'})[l];${translationHook}
return <><p id="progress">Progress: {progress}/10</p><SynchronizedForecastCharts validationData={result.validation_data} forecastData={result.forecast_data} t={t} isDark={dark}/></>};ReactDOM.render(<App/>,document.getElementById('qa'));`,{presets:['react']}).code),{code:chunks.join('\n'),fixture,translationHook});
await page.waitForSelector('.recharts-area-curve');
for(const chartIndex of [0,1]){
 const chart=page.locator('.fc-detail-chart').nth(chartIndex),curve=chart.locator('.recharts-area-curve').first();
 const points=[...(await curve.getAttribute('d')).matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m=>({x:+m[1],y:+m[2]}));
 const box=await chart.locator('svg.recharts-surface').boundingBox();
 await page.mouse.click(box.x+points[5].x,box.y+points[5].y);
 const tooltip=chart.locator('.fc-chart-tooltip');await tooltip.waitFor({state:'visible'});
 const before=await tooltip.innerText();
 for(let i=0;i<3;i++){
  await page.evaluate(()=>window.tick());
  await page.waitForTimeout(80);
  assert.ok(await tooltip.isVisible(),'Tooltip hidden after another ID completed');
  assert.equal(await tooltip.innerText(),before,'Tooltip changed after another ID completed');
 }
}
await page.evaluate(()=>window.update('vi',false));
assert.ok((await page.locator('.fc-chart-header').first().innerText()).includes('kiểm định'));
await page.evaluate(()=>window.replaceResult());
assert.equal(await page.evaluate(()=>window.charts[1].props.data[0].actual_history),110);
// Mobile uses touch gestures; verify the zoom buttons at their desktop breakpoint.
if(page.viewportSize().width<769)await page.setViewportSize({width:1000,height:800});
await page.getByRole('button',{name:'Zoom In',exact:true}).first().click();
assert.ok(await page.evaluate(()=>window.charts[0].props.data.length<12));
assert.equal(await page.evaluate(()=>window.charts[0].props.data.length),await page.evaluate(()=>window.charts[1].props.data.length));
assert.deepEqual(errors,[]);
console.log('PASS: click tooltips remain stable through progress updates on both charts; language/theme/new results still update.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
