const {chromium}=require('C:/Users/anton/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined;
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}: {})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(process.env.EHV_TEST_ORIGIN||'http://127.0.0.1:8097',{waitUntil:'domcontentloaded'});
    await page.locator('#login-form input[name="email"]').fill('admin@ehv.test');
    await page.locator('#login-form input[name="password"]').fill('ChangeMe123!');
    await page.locator('#login-form button[type="submit"]').click();
    await page.locator('.management-page').waitFor({timeout:15000});
    const result=await page.evaluate(()=>({title:document.querySelector('#page-title')?.textContent,kpis:[...document.querySelectorAll('.management-kpi strong')].map(node=>node.textContent),nav:[...document.querySelectorAll('#nav [data-page]')].map(node=>node.textContent.trim()),tabs:[...document.querySelectorAll('[data-dashboard-tab]')].map(node=>node.textContent.trim()),infoButtons:document.querySelectorAll('[data-kpi-info]').length,pageErrors:[],overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
    result.pageErrors=pageErrors;
    await page.screenshot({path:'management-dashboard.png',fullPage:true});
    const sections=['managementHomesHub','managementPartnersHub','managementSalesHub','managementOperationsHub','managementBrokerHub','managementSales','managementFunnel','managementOnboarding','managementSalesPerformance','managementForecast','managementPartners','managementContracts','managementRevenue','managementReferrals','managementBasic','managementOpportunities','managementProperties','managementRegions','managementOperations','managementBroker'];result.sections={};
    for(const section of sections){
      await page.evaluate(pageName=>window.ehvRender(pageName),section);
      await page.waitForFunction(pageName=>document.querySelector('.management-page')&&!document.querySelector('#content>.page>.error')&&document.querySelector('#page-title')?.textContent===pageName,await page.locator('#page-title').textContent(),{timeout:10000}).catch(()=>{});
      if(await page.locator('#content>.page>.error').count())throw new Error(`Bereich ${section} konnte nicht geladen werden`);
      result.sections[section]=await page.locator('#page-title').textContent();
    }
    console.log(JSON.stringify(result,null,2));
    if(result.kpis.length<20||result.nav.length!==6||result.tabs.length!==3||result.infoButtons<1||result.pageErrors.length||result.overflow||Object.keys(result.sections).length!==sections.length)throw new Error('Management-Dashboard Browserprüfung fehlgeschlagen');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
