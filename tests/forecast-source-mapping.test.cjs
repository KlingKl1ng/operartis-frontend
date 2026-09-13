const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../vendor/xlsx-0.18.5.full.min.js');
const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const dates = source.slice(source.indexOf('const DEFAULT_FREQUENCY_PROFILES ='), source.indexOf('const parseForecastCapabilities ='));
const mapping = source.slice(source.indexOf('const suggestForecastMapping ='), source.indexOf('const PREPARATION_METHODS ='));
const {suggest, inspect, read, readVertical, pivot, append, upload, suggestVertical, previewRows} = new Function('XLSX', dates + mapping + ';return {suggest:suggestForecastMapping, inspect:inspectForecastMapping, read:readForecastWorksheet, readVertical:readVerticalForecastTemplate, pivot:inspectVerticalForecastSource, append:appendForecastSourceForm, upload:readForecastUpload, suggestVertical:suggestVerticalForecastMapping, previewRows:verticalForecastPreviewRows};')(XLSX);

test('the supplied template has a valid default mapping for every item and period', () => {
    const workbook = XLSX.read(fs.readFileSync(path.join(__dirname, '../assets/templates/Template-Horizontal-Format.xlsx')), {type:'buffer', cellNF:true});
    const data = read(workbook);
    data.mapping = suggest(data.headers);
    assert.deepEqual(data.mapping, {sku:'Item ID',start:'Jan-21',end:'Dec-23'});
    assert.deepEqual(inspect(data), {valid:true, count:36, items:20, frequency:'monthly'});
});

test('custom file suggestions exclude metadata and preserve leading-zero identifiers', () => {
    const headers = ['Description', 'Item ID', '2026-01-01','2026-02-01','2026-03-01','Total'];
    const data = {headers, rows:[['Widget','000123',0,12,13,25]], mapping:suggest(headers)};
    assert.equal(data.mapping.sku, 'Item ID');
    assert.deepEqual(inspect(data), {valid:true,count:3,items:1,frequency:'monthly'});
    data.mapping.end = 'Total';
    assert.equal(inspect(data).valid, false);
});

test('invalid mappings cannot be confirmed', () => {
    const headers = ['Item ID','2026-01-01','2026-02-01','2026-03-01'];
    const data = {headers,rows:[['SKU-1',1,2,3]],mapping:suggest(headers)};
    for(const mapping of [
        {...data.mapping,sku:'2026-02-01'},
        {...data.mapping,start:'2026-03-01',end:'2026-01-01'},
        {...data.mapping,sku:''},
        {...data.mapping,start:''},
    ]) assert.equal(inspect({...data,mapping}).valid,false);
    assert.equal(inspect({...data,rows:[]}).valid,false);
    assert.equal(inspect(null).valid,false);
    assert.deepEqual(suggest(['Code','Description']),{sku:'Code',start:'',end:''});
});


test('vertical and horizontal templates both validate with the same item and period counts', () => {
    const load = name => XLSX.read(fs.readFileSync(path.join(__dirname, '../assets/templates/' + name)), {type:'buffer',cellNF:true});
    for (const format of ['Vertical', 'Horizontal']) {
        const data = upload(load(`Template-${format}-Format.xlsx`));
        assert.deepEqual(inspect(data), {valid:true,count:36,items:20,frequency:'monthly'});
    }
});

test('data preview always normalizes horizontal and vertical inputs to observation rows', () => {
    const expected = [
        {unique_id:'A',ds:'2026-01-01',quantity:1},
        {unique_id:'A',ds:'2026-02-01',quantity:2},
        {unique_id:'B',ds:'2026-01-01',quantity:3},
        {unique_id:'B',ds:'2026-02-01',quantity:4},
    ];
    const horizontal = {
        format:'horizontal',
        headers:['SKU','2026-01-01','2026-02-01'],
        rows:[['A',1,2],['B',3,4]],
        mapping:{sku:'SKU',start:'2026-01-01',end:'2026-02-01'},
    };
    const vertical = {
        format:'vertical',
        headers:['Quantity','SKU','Date'],
        rows:[[1,'A','2026-01-01'],[2,'A','2026-02-01'],[3,'B','2026-01-01'],[4,'B','2026-02-01']],
        mapping:{sku:'SKU',date:'Date',value:'Quantity'},
    };
    assert.deepEqual(previewRows(horizontal),expected);
    assert.deepEqual(previewRows(vertical),expected);
});

test('confirmation sends original vertical file bytes and explicit mappings without pivoting', async () => {
    const bytes = fs.readFileSync(path.join(__dirname,'../assets/templates/Template-Vertical-Format.xlsx'));
    const file = new File([bytes], 'Template-Vertical-Format.xlsx');
    const data = {...upload(XLSX.read(bytes,{type:'buffer',cellNF:true})),file};
    const form = new FormData();
    append(form,data);
    assert.equal(Buffer.from(await form.get('file').arrayBuffer()).equals(bytes),true);
    assert.equal(form.get('data_format'),'vertical');
    assert.equal(form.get('sku_col_idx'),'0');
    assert.equal(form.get('date_col_idx'),'1');
    assert.equal(form.get('quantity_col_idx'),'2');
    assert.equal(form.has('start_col_idx'),false);
    assert.equal(data.rows.length,720);
});

test('vertical normalization preserves zeros and rejects duplicates, gaps and invalid values', () => {
    const rows = [['00123','2025-01-01',0],['00123','2025-02-01',2],['00456','2025-01-01',3],['00456','2025-02-01',4]];
    assert.deepEqual(pivot({rows}),{valid:true,count:2,items:2,frequency:'monthly'});
    assert.equal(pivot({rows:[...rows,rows[0]]}),null);
    assert.equal(pivot({rows:rows.slice(1)}),null);
    assert.equal(pivot({rows:[['00123','bad date',1]]}),null);
    assert.equal(pivot({rows:[['00123','2025-01-01','']]}),null);
});

test('custom uploads automatically recognize both supplied Excel formats', () => {
    for (const format of ['Vertical', 'Horizontal']) {
        const data = upload(XLSX.read(fs.readFileSync(path.join(__dirname, `../assets/templates/Template-${format}-Format.xlsx`)), {type:'buffer',cellNF:true,raw:true}));
        assert.equal(data.format, format.toLowerCase());
        assert.deepEqual(inspect(data), {valid:true,count:36,items:20,frequency:'monthly'});
    }
});

test('vertical CSV detects reordered aliases and sends the original CSV with matching column indices', async () => {
    const csv = 'Description,y,unique_id,ds\nWidget,0,00123,2025-01-01\nWidget,1200.5,00123,2025-02-01\nPart,3,00456,2025-01-01\nPart,4,00456,2025-02-01';
    const data = {...upload(XLSX.read(csv,{type:'string',raw:true,cellNF:true})),file:{name:'sales.csv'}};
    assert.equal(data.format,'vertical');
    assert.deepEqual(data.mapping,{sku:'unique_id',date:'ds',value:'y'});
    assert.equal(inspect(data).valid,true);
    const form = new FormData();
    data.file = new File([csv], 'sales.csv');
    append(form,data);
    assert.equal(form.get('file').name,'sales.csv');
    assert.equal(await form.get('file').text(),csv);
    assert.equal(form.get('sku_col_idx'),'2');
    assert.equal(form.get('date_col_idx'),'3');
    assert.equal(form.get('quantity_col_idx'),'1');
});

test('horizontal CSV detection takes precedence over metadata named Date', () => {
    const data = upload(XLSX.read('SKU,Date,2025-01-01,2025-02-01\n00123,created,0,2',{type:'string',raw:true}));
    assert.equal(data.format,'horizontal');
    assert.deepEqual(data.mapping,{sku:'SKU',start:'2025-01-01',end:'2025-02-01'});
    assert.equal(inspect(data).valid,true);
});

test('Excel vertical uploads preserve formatted IDs, raw quantities and hourly dates in both epochs', () => {
    for (const date1904 of [false,true]) {
        const book = XLSX.utils.book_new();
        book.Workbook = {WBProps:{date1904}};
        const sheet = XLSX.utils.aoa_to_sheet([['SKU','Date','Quantity'],[123,45000,1234.567],[123,45000+1/24,0]]);
        for (const address of ['A2','A3']) sheet[address].z = '000000';
        for (const address of ['B2','B3']) sheet[address].z = 'dd/mm/yyyy';
        for (const address of ['C2','C3']) sheet[address].z = '#,##0.00';
        XLSX.utils.book_append_sheet(book,sheet,'Data');
        const data = upload(XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellNF:true}));
        assert.equal(data.format,'vertical');
        assert.equal(inspect(data).frequency,'hourly');
        assert.equal(inspect(data).valid,true);
        assert.equal(data.rows[0][0],'000123');
        assert.equal(data.rawRows[0][2],1234.567);
    }
});

test('date values detect unfamiliar headers and manual mappings control normalization', () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Reference','Observation','Recorded','Adjusted'],['A','2025-01-01',1,10],['A','2025-02-01',2,20]]),'Data');
    const data = upload(book);
    assert.equal(data.format,'vertical');
    assert.equal(inspect({...data,mapping:{sku:'Reference',date:'Observation',value:'Adjusted'}}).valid,true);
    assert.equal(inspect({...data,mapping:{sku:'Reference',date:'Observation',value:'Observation'}}).valid,false);
    const overridden = upload(book,'horizontal');
    assert.equal(overridden.format,'horizontal');
    assert.equal(overridden.detectedFormat,'vertical');
    assert.equal(inspect(overridden).valid,false);
    assert.equal(suggestVertical(data).date,'Observation');
});

test('vertical custom validation blocks missing, nonnumeric and duplicate observations', () => {
    const csv = 'SKU,Date,Quantity\nA,2025-01-01,0\nA,2025-02-01,2';
    const readCSV = text => upload(XLSX.read(text,{type:'string',raw:true}));
    assert.equal(inspect(readCSV(csv)).valid,true);
    for (const text of [csv.replace(',2',','),csv.replace(',2',',unknown'),csv+'\nA,2025-01-01,3',csv+'\nB,2025-01-01,3']) assert.equal(inspect(readCSV(text)).valid,false);
});


test('forecast requests retain preparation rules and saved version identity',()=>{
    const data={file:new Blob(['original']),format:'vertical',headers:['ID','Date','Quantity'],mapping:{sku:'ID',date:'Date',value:'Quantity'},preparation:{method:'forward',frequency:'monthly'},versionId:'version-1'};
    const form=new FormData();append(form,data);
    assert.equal(form.get('preparation'),JSON.stringify(data.preparation));
    assert.equal(form.get('dataset_version_id'),'version-1');
});
