const originalFetch=global.fetch;
const localBase=()=>process.env.TEST_LOCAL_BASE;
global.fetch=(input,options)=>{
  const url=String(input);
  if(url.startsWith('https://api.eigenheimverwalter.de/'))return originalFetch(`${localBase()}${url.slice('https://api.eigenheimverwalter.de'.length)}`,options);
  return originalFetch(input,options);
};
