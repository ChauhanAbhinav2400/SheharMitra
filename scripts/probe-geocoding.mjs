import dotenv from 'dotenv';
dotenv.config({path:'backend/.env',quiet:true});
for(const query of [
 {city:'Raipur Sadat',state:'Uttar Pradesh',postcode:'246763',country:'India'},
 {city:'Raipur Sadat',state:'Uttar Pradesh',country:'India'},
 {text:'Raipur Sadat, Uttar Pradesh, India'},
 {city:'Nagina',state:'Uttar Pradesh',country:'India'}
]){
 const url=new URL('https://api.geoapify.com/v1/geocode/search');for(const [k,v] of Object.entries({...query,format:'json',limit:'3',filter:'countrycode:in',apiKey:process.env.GEOAPIFY_API_KEY}))url.searchParams.set(k,v);
 const response=await fetch(url,{signal:AbortSignal.timeout(8000)}),data=await response.json();
 console.log(JSON.stringify({query,status:response.status,results:data.results?.map(r=>({city:r.city,town:r.town,village:r.village,name:r.name,state:r.state,postcode:r.postcode,type:r.result_type,rank:r.rank,placeId:r.place_id}))}));
}
