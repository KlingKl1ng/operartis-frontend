const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const build = new Function(source.slice(source.indexOf('const buildValidationReplay ='), source.indexOf('const ReplayWindowLabel =')) + '; return buildValidationReplay;')();
const dates = Array.from({length:8}, (_,i)=>`2024-01-0${i+1}`);
test('calendar closures remain visible but are excluded from replay accuracy',()=>{
    const data=result();data.preparation={operating_calendar:{enabled:true}};
    data.validation_forecasts[0]={...data.validation_forecasts[0],actual:0,forecast:0,closed:true};
    const replay=build(data);
    assert.equal(replay.folds[0].points.length,2);
    assert.equal(replay.folds[0].scoredCount,1);
    assert.equal(replay.folds[0].metrics.mae,4);
});
function result(method='walk_forward') {
    return {validation_method:method, validation_summary:{training_window:3,validation_period:5,forecast_horizon:2,evaluations:2},
        forecast_data:dates.map(date=>({date,actual_history:10})),
        validation_forecasts:[
            {origin:dates[2]+'T00:00:00',date:dates[3]+'T00:00:00',lead:1,actual:10,forecast:8},
            {origin:dates[2]+'T00:00:00',date:dates[4]+'T00:00:00',lead:2,actual:10,forecast:14},
            {origin:dates[3]+'T00:00:00',date:dates[4]+'T00:00:00',lead:1,actual:10,forecast:30},
            {origin:dates[3]+'T00:00:00',date:dates[5]+'T00:00:00',lead:2,actual:10,forecast:10},
        ]};
}
test('expanding training windows grow; overlapping targets retain origin-specific forecasts',()=>{
    const replay=build(result());
    assert.deepEqual(replay.folds.map(f=>[f.start,f.end]),[[0,2],[0,3]]);
    assert.equal(replay.folds[0].points[1].forecast,14);
    assert.equal(replay.folds[1].points[0].forecast,30);
    assert.deepEqual(replay.folds[0].metrics,{rmse:Math.sqrt(10),mae:3,mape:30});
    assert.ok(replay.domain[1]>30);
});
test('rolling training windows slide with constant length',()=>{
    const replay=build(result('rolling_window'));
    assert.deepEqual(replay.folds.map(f=>[f.start,f.end]),[[0,2],[1,3]]);
});
test('simple split supports a single evaluation and negative forecasts',()=>{
    const data=result('simple');data.validation_summary.evaluations=1;data.validation_forecasts=data.validation_forecasts.slice(0,2);
    data.validation_forecasts[0].forecast=-5;
    const replay=build(data);assert.equal(replay.folds.length,1);assert.ok(replay.domain[0]<-5);
});
test('MAPE excludes zero actuals and is unavailable when all actuals are zero',()=>{
    const data=result();data.validation_forecasts[0].actual=0;
    assert.equal(build(data).folds[0].metrics.mape,40);
    data.validation_forecasts[1].actual=0;
    const metrics=build(data).folds[0].metrics;
    assert.equal(metrics.mape,null);assert.equal(metrics.mae,11);
});
test('timezone representations, hourly dates and unordered records match correctly',()=>{
    const data=result();
    data.forecast_data=data.forecast_data.map((p,i)=>({...p,date:`2024-01-01T${String(i).padStart(2,'0')}:00:00`}));
    data.validation_forecasts.forEach(p=>{
        p.origin=`2024-01-01T${String(Number(p.origin.slice(8,10))-1).padStart(2,'0')}:00:00Z`;
        p.date=`2024-01-01T${String(Number(p.date.slice(8,10))-1).padStart(2,'0')}:00:00+00:00`;
    });
    data.validation_forecasts.reverse();
    assert.deepEqual(build(data).folds.map(f=>f.end),[2,3]);
});
test('missing or incomplete records cannot silently produce a fabricated replay',()=>{
    for (const change of [d=>delete d.validation_forecasts,d=>d.validation_forecasts.pop(),d=>d.validation_forecasts[0].forecast=null,d=>d.validation_forecasts[0].lead=2,d=>d.forecast_data.splice(2,1),d=>d.validation_method='unknown']) {
        const data=result();change(data);assert.equal(build(data),null);
    }
});

test('expanding validation on a suffix excludes older history from training',()=>{
    const data=result();
    data.forecast_data.unshift({date:'2023-12-31',actual_history:50});
    const replay=build(data);
    assert.deepEqual(replay.folds.map(f=>[f.start,f.end]),[[1,3],[1,4]]);
});


test('prepared replay preserves missing dates and excludes them from fold metrics',()=>{
    const data=result(); data.preparation={method:'forward'};
    data.forecast_data[1].actual_history=null;
    data.forecast_data[4].actual_history=null;
    data.validation_summary.all_forecasts=data.validation_forecasts.map(p=>({...p,actual:p.date.startsWith(dates[4])?null:p.actual}));
    data.validation_forecasts=data.validation_summary.all_forecasts.filter(p=>p.actual!==null);
    const replay=build(data);
    assert.equal(replay.history.length,8);
    assert.equal(replay.history[1].value,null);
    assert.equal(replay.folds[0].points.length,2);
    assert.equal(replay.folds[0].scoredCount,1);
    assert.equal(replay.folds[0].metrics.mae,2);
    assert.equal(replay.folds[1].metrics.mae,0);
});

test('prepared display metadata cannot become simulation scoring targets',()=>{
 const data=result();data.preparation={method:'interpolation'};
 Object.assign(data.forecast_data[4],{actual_history:null,prepared_actual:100,preparation_method:'interpolation'});
 data.validation_summary.all_forecasts=data.validation_forecasts.map(p=>({...p,actual:p.date.startsWith(dates[4])?null:p.actual}));
 const replay=build(data);
 assert.equal(replay.history[4].value,null);
 assert.equal(replay.history[4].prepared_actual,100);
 assert.equal(replay.history[4].preparation_method,'interpolation');
 assert.ok(replay.domain[1]>100);
 assert.equal(replay.folds[0].scoredCount,1);
 assert.equal(replay.folds[0].metrics.mae,2);
 assert.equal(replay.folds[1].metrics.mae,0);
});
