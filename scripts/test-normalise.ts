// Quick checks for the trade-notation parsers. Run: npm run test:normalise
import * as n from "../lib/normalise/index";
const c=(a:any,b:any,l:string)=>console.log(JSON.stringify(a)===JSON.stringify(b)?"ok ":"FAIL",l,JSON.stringify(a));
c(n.parseNumber("58,03"),58.03,"58,03");c(n.parseNumber("1.234,56"),1234.56,"de");c(n.parseNumber("$1,234.56"),1234.56,"us");
c(n.parseNumber("€ 185,-"),185,"185,-");c(n.parseNumber("12.40€"),12.4,"12.40€");c(n.parseNumber("1,234"),1234,"1,234");
for (const [s,e] of [["70cl",70],["0,7",70],["1L",100],["700ml",70],["0,70L",70],["1.75",175],["3L",300],["300CL",300],["1,75L",175],["0.2",20],["3",300],["100",100],["3000ml",300]] as const) c(n.parseSize(s),e,s);
c(n.sizeFromText("Absolut 1L GBX"),{size:100,rest:"Absolut GBX"},"in name");
c(n.sizeFromText("JW Red 70cl"),{size:70,rest:"JW Red"},"in name2");
c(n.parseCaseConfig("12/100/40"),{bottles_per_case:12,bottle_size_cl:100,abv:40},"12/100/40");
c(n.parseCaseConfig("6/70/37.5"),{bottles_per_case:6,bottle_size_cl:70,abv:37.5},"6/70/37.5");
c(n.parseCaseConfig("12x1L"),{bottles_per_case:12,bottle_size_cl:100},"12x1L");
c(n.parseCaseConfig("6x"),{bottles_per_case:6},"6x");c(n.parseCaseConfig("24x35cl GBX"),{bottles_per_case:24,bottle_size_cl:35},"24x35");
c(n.parsePrice("8.95e"),{price:8.95,currency:"EUR"},"8.95e");c(n.parsePrice("11.40e/btl"),{price:11.4,currency:"EUR",unit:"bottle"},"/btl");
c(n.parsePrice("€ 185,20 /cs"),{price:185.2,currency:"EUR",unit:"case"},"/cs");c(n.parsePrice("$185.00"),{price:185,currency:"USD"},"$");
c(n.parseQuantity("2 FTL"),{quantity:2,unit:"ftl"},"ftl");c(n.parseQuantity("5 pallets"),{quantity:5,unit:"pallets"},"pal");c(n.parseQuantity("300 cs"),{quantity:300,unit:"cases"},"cs");
c(n.parseLeadTime("2-3 wks").days,14,"2-3wks");c(n.parseLeadTime("3-4 Wochen").days,21,"wochen");c(n.parseLeadTime("ex stock").days,0,"exstock");c(n.parseLeadTime("4-5 wks").days,28,"45");
c(n.parsePackaging("mit GP"),"GBX","gp");c(n.parsePackaging("NGBX uncoded"),"NGBX","ngbx");
c(n.parseFlags("uncoded"),{is_coded:false},"uncoded");c(n.parseFlags("UK spec"),{market_spec:"UK"},"uk");c(n.parseFlags("refill"),{is_refillable:true},"refill");c(n.parseFlags("TR"),{market_spec:"TR"},"tr");c(n.parseFlags("EU labels"),{market_spec:"EU"},"eu");
c(n.normaliseIncoterm("Ex-works"),"EXW","exw");c(n.normaliseIncoterm("C&F"),"CNF","cnf");c(n.normaliseIncoterm("FOB SIN"),"FOB","fob");
