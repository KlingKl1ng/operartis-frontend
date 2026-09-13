const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../forecaster.html'),'utf8');
const code = html.slice(html.indexOf('const missingHandlingStatus ='),html.indexOf('const MissingDataReview ='));
const status = new Function(code+';return missingHandlingStatus;')();
const base = {missing_count:4,unresolved:0,policy:{frequency_confirmed:false,reviewed_items:[]},items:[
    {id:'A',missing:2,unresolved:0,review_required:false},{id:'B',missing:2,unresolved:0,review_required:false}]};

test('filled values still require final confirmation',()=>{
    const result=status(base,true,'');
    assert.equal(result.readyToConfirm,true);
    assert.equal(result.summary,'All 4 gaps handled · Confirm frequency & handling');
    assert.equal(result.items,'All 2 items handled');
    assert.notEqual(result.tone,'success');
    assert.equal(status({...base,policy:{...base.policy,frequency_confirmed:true}},true,'').tone,'success');
});

test('unresolved gaps stay actionable while legacy item-review flags do not block handling',()=>{
    const result=status({...base,unresolved:2,items:[{...base.items[0],unresolved:2},{...base.items[1],review_required:true}]},true,'');
    assert.equal(result.readyToConfirm,false);
    assert.equal(result.summary,'2/4 gaps handled · 2 unresolved');
    assert.equal(result.items,'1/2 items need attention');
});

test('pending requests and errors cannot display completion',()=>{
    assert.equal(status(base,false,'').readyToConfirm,false);
    assert.equal(status(base,false,'').items,'Updating…');
    assert.equal(status(base,true,'Calendar mismatch').readyToConfirm,false);
    assert.equal(status(base,true,'Calendar mismatch').summary,'Resolve the scan error first');
});

test('filled quantities are handled without per-item review acknowledgment',()=>{
    const review={...base,items:[{...base.items[0],review_required:true},base.items[1]]};
    assert.equal(status(review,true,'').readyToConfirm,true);
    assert.equal(status({...review,policy:{...base.policy,reviewed_items:['A']}},true,'').readyToConfirm,true);
});

test('handling edits invalidate confirmation but explicit confirmation can restore it',()=>{
    const start=html.indexOf('const updatePreparation = patch =>');
    const end=html.indexOf('const readySource =',start);
    let sources={custom:{preparation:{frequency:'daily',frequency_confirmed:true,method:'forward'}}};
    const update=new Function('setSources','sourceKey','review',html.slice(start,end)+';return updatePreparation;')(fn=>{sources=fn(sources);},'custom',{policy:sources.custom.preparation});
    update({method:'interpolation'});
    assert.equal(sources.custom.preparation.frequency_confirmed,false);
    update({frequency_confirmed:true});
    assert.equal(sources.custom.preparation.frequency_confirmed,true);
    update({overrides:{A:'backward'}});
    assert.equal(sources.custom.preparation.frequency_confirmed,false);
});

const filterRecords = new Function(code+';return filterPreparationRecords;')();
test('unresolved preview includes conflicts and errors while excluding filled gaps and legacy review flags',()=>{
    const review={policy:{reviewed_items:[]},items:[{id:'A',review_required:true},{id:'B'}],records:[
        {unique_id:'B',ds:'empty',missing:true,prepared:null},
        {unique_id:'B',ds:'absent',missing:true,kind:'absent_period',prepared:null},
        {unique_id:'B',ds:'conflict',missing:false,closed:true,conflict:true,prepared:null},
        {unique_id:'A',ds:'pending-review',missing:true,prepared:10},
        {unique_id:'B',ds:'resolved',missing:true,prepared:0},
        {unique_id:'B',ds:'observed-zero',missing:false,prepared:0},
        {unique_id:'B',ds:'closure',missing:false,closed:true,prepared:0},
    ]};
    assert.deepEqual(filterRecords(review,'',true,false).map(r=>r.ds),['empty','absent','conflict']);
    assert.deepEqual(filterRecords(review,'B',true,true).map(r=>r.ds),['empty','absent','conflict']);
    review.policy.reviewed_items=['A'];
    assert.deepEqual(filterRecords(review,'A',true,false),[]);
    assert.equal(filterRecords(review,'',false,false).length,7);
    assert.deepEqual(filterRecords(null,'',true,false),[]);
});
