const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const start = html.indexOf('const mappingSignature = source ?');
const end = html.indexOf('const loading = busy === sourceKey;', start);
const derive = new Function('source', 'reviewState', 'reviewError', html.slice(start, end) + ';return {review,displayReview,reviewCurrent,reviewUpdating,info,detectedFrequency,handlingLocked};');
const file = {};
const source = {file,format:'vertical',mapping:{sku:'ID',date:'Date',value:'Quantity'},preparation:{frequency:'daily',method:'forward',overrides:{}}};
const data = {valid:true,missing_count:2,period_count:7,item_count:1,frequency:'daily',policy:source.preparation,items:[{id:'A',method:'forward'}],records:[]};
const state = {file,frequencySelection:'daily',mappingSignature:JSON.stringify([source.mapping,source.format]),signature:JSON.stringify([source.mapping,source.preparation,source.format]),data};

test('handling changes retain the review while blocking stale confirmation and export',()=>{
    const next = {...source,preparation:{...source.preparation,overrides:{A:'interpolation'}}};
    const pending = derive(next,state,'');
    assert.equal(pending.review,data);
    assert.equal(pending.displayReview.items[0].method,'interpolation');
    assert.equal(pending.reviewUpdating,true);
    assert.equal(pending.info.valid,false);
    const finished = derive(next,{...state,signature:JSON.stringify([next.mapping,next.preparation,next.format])},'');
    assert.equal(finished.reviewCurrent,true);
    assert.equal(finished.info.valid,true);
});

test('auto suggestion previews item recommendations without replacing manual choices',()=>{
    const next={...source,preparation:{...source.preparation,auto_suggest:true,method:'none',overrides:{A:'backward',B:'none'}}};
    const prior={...state,data:{...data,items:[{id:'A',method:'forward',suggested:'interpolation'},{id:'B',method:'none',suggested:'seasonal'},{id:'C',method:'none',suggested:'interpolation'},{id:'D',method:'none',suggested:'none'}]}};
    const result=derive(next,prior,'');
    assert.deepEqual(result.displayReview.items.map(item=>item.method),['backward','none','interpolation','none']);
    assert.equal(result.info.valid,false);
    assert.equal(result.displayReview.policy.auto_suggest,true);
});

test('failed updates retain controls but cannot confirm stale prepared data',()=>{
    const failed = derive(source,state,'Unable to scan');
    assert.equal(failed.review,data);
    assert.equal(failed.info.valid,false);
    assert.equal(failed.reviewUpdating,false);
});

test('different files and column mappings never inherit the previous review',()=>{
    for(const next of [{...source,file:{}},{...source,mapping:{...source.mapping,value:'Other'}},{...source,format:'horizontal'}]){
        const result = derive(next,state,'');
        assert.equal(result.review,null);
        assert.equal(result.info.valid,false);
    }
});

test('automatic frequency label stays stable while a handling change is scanned',()=>{
    const automatic={...source,preparation:{...source.preparation,frequency:null,method:'interpolation'}};
    const result=derive(automatic,{...state,frequencySelection:null},'');
    assert.equal(result.reviewCurrent,false);
    assert.equal(result.detectedFrequency,'daily');
    assert.equal(derive({...automatic,preparation:{...automatic.preparation,frequency:'weekly'}},state,'').detectedFrequency,null);
});

test('handling requires a successfully checked calendar and unlocks after recovery',()=>{
    assert.equal(derive(source,state,'').handlingLocked,false);
    assert.equal(derive(source,state,'Calendar mismatch').handlingLocked,true);
    const changed={...source,preparation:{...source.preparation,frequency:'weekly'}};
    assert.equal(derive(changed,state,'').handlingLocked,true);
    const automatic={...source,preparation:{...source.preparation,frequency:null}};
    assert.equal(derive(automatic,state,'').handlingLocked,true);
    assert.equal(derive(automatic,{...state,frequencySelection:null},'').handlingLocked,false);
    const methodChanged={...source,preparation:{...source.preparation,method:'interpolation'}};
    assert.equal(derive(methodChanged,state,'').handlingLocked,false);
});

const effectStart=html.indexOf('useEffect(()=>{\n                if (!source) return;',start);
const effectEnd=html.indexOf('const updatePreparation =',effectStart);
const runScan=new Function('source','signature','mappingSignature','baseUrl','datasetRequest','preparationMapping','setReviewState','setReviewError','FormData', 'let cleanup;const useEffect=fn=>{cleanup=fn();};'+html.slice(effectStart,effectEnd)+';return cleanup;');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const EmptyForm=class {append(){}};

test('scan retries keep an existing error until success and ignore aborted responses',async()=>{
    const errors=[],states=[];
    let resolveRequest,rejectRequest;
    const request=()=>new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;});
    const args=[source,'new','mapping','',request,()=>({}),value=>states.push(value),value=>errors.push(value),EmptyForm];
    runScan(...args);
    assert.deepEqual(errors,[],'Do not remove the error box while retrying.');
    rejectRequest(new Error('Calendar mismatch'));
    await flush();
    assert.deepEqual(errors,['Calendar mismatch']);
    runScan(...args);
    assert.deepEqual(errors,['Calendar mismatch']);
    resolveRequest({json:async()=>data});
    await flush();
    assert.deepEqual(errors,['Calendar mismatch','']);
    assert.equal(states.length,1);
    const cancel=runScan(...args);
    cancel();
    resolveRequest({json:async()=>data});
    await flush();
    assert.equal(states.length,1);
    assert.deepEqual(errors,['Calendar mismatch','']);
});
