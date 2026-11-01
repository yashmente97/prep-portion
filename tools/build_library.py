"""Builds library.json: label ingredients, generic fruit/veg, recipes and breakfasts.
Bump VERSION whenever anything changes so installed apps merge the update."""
import json, glob, os, sys
VERSION = 1
DUMP = sys.argv[1]
OUT = sys.argv[2]

ings = {}
for f in sorted(glob.glob(os.path.join(DUMP, 'ingredients', '*.json'))):
    d = json.load(open(f)); ings[os.path.basename(f)[:-5]] = {**d, 'src': 'label'}

# Generic values per 100 g edible part; carbs exclude fibre (EU convention).
# name, kcal, protein, carbs, fat, fibre, sat
G = [
 ('veg','broccoli','Broccoli',35,2.8,4.0,0.4,2.6,0.1),
 ('veg','cauliflower','Cauliflower',25,1.9,3.0,0.3,2.0,0.1),
 ('veg','green-beans','Green beans',31,1.8,4.3,0.2,2.7,0.0),
 ('veg','bell-pepper','Bell pepper',29,1.0,4.6,0.3,2.1,0.0),
 ('veg','courgette','Courgette',18,1.2,2.1,0.3,1.0,0.1),
 ('veg','carrot','Carrot',38,0.9,6.8,0.2,2.8,0.0),
 ('veg','mushrooms','Mushrooms',24,3.1,2.3,0.3,1.0,0.0),
 ('veg','garlic','Garlic',150,6.4,31.0,0.5,2.1,0.1),
 ('veg','ginger','Ginger',80,1.8,15.8,0.8,2.0,0.2),
 ('veg','leek','Leek',31,1.5,4.3,0.3,2.3,0.0),
 ('veg','sweet-potato','Sweet potato',82,1.6,17.1,0.1,3.0,0.0),
 ('veg','potato-raw','Potatoes, raw',75,2.0,15.4,0.1,2.2,0.0),
 ('veg','peas-frozen','Peas, frozen',77,5.4,9.6,0.4,5.7,0.1),
 ('veg','sweetcorn','Sweetcorn',90,3.3,16.3,1.4,2.0,0.2),
 ('veg','cucumber','Cucumber',15,0.7,2.6,0.1,0.5,0.0),
 ('veg','lettuce','Lettuce / mixed salad',16,1.4,1.5,0.2,1.3,0.0),
 ('veg','kale','Kale (boerenkool)',45,2.9,4.4,0.9,4.1,0.1),
 ('veg','spring-onion','Spring onion',33,1.8,4.7,0.2,2.6,0.0),
 ('veg','aubergine','Aubergine',24,1.0,2.9,0.2,3.0,0.0),
 ('veg','red-cabbage','Red cabbage',32,1.4,5.3,0.2,2.1,0.0),
 ('veg','brussels-sprouts','Brussels sprouts',44,3.4,5.2,0.3,3.8,0.1),
 ('veg','tomato','Tomato',18,0.9,2.7,0.2,1.2,0.0),
 ('veg','avocado','Avocado',160,2.0,1.8,14.7,6.7,2.1),
 ('fruit','lemon-juice','Lemon juice',29,0.4,6.6,0.2,0.3,0.0),
 ('fruit','apple','Apple',53,0.3,11.4,0.2,2.4,0.0),
 ('fruit','pear','Pear',57,0.4,12.1,0.1,3.1,0.0),
 ('fruit','orange','Orange',47,0.9,9.4,0.1,2.4,0.0),
 ('fruit','kiwi','Kiwi',62,1.1,11.7,0.5,3.0,0.0),
 ('fruit','strawberries','Strawberries',32,0.7,5.7,0.3,2.0,0.0),
 ('fruit','blueberries','Blueberries',59,0.7,12.1,0.3,2.4,0.0),
 ('fruit','raspberries','Raspberries',46,1.2,5.4,0.7,6.5,0.0),
 ('fruit','mixed-berries-frozen','Mixed berries, frozen',45,0.9,7.5,0.4,4.0,0.0),
 ('fruit','mango','Mango',62,0.8,13.4,0.4,1.6,0.1),
 ('fruit','pineapple','Pineapple',51,0.5,11.7,0.1,1.4,0.0),
 ('fruit','grapes','Grapes',72,0.7,17.2,0.2,0.9,0.1),
]
for cat,i,n,k,p,c,f,fib,sat in G:
    est = 4*p+4*c+9*f+2*fib
    assert abs(est-k)/k < 0.12, (n, k, est)
    ings[i] = {'name': n, 'unit':'g', 'kcal':k, 'p':p, 'c':c, 'f':f, 'fib':fib, 'sat':sat,
               'store':'', 'pack':None, 'src':'generic', 'cat':cat}
for i in ['banana','cherry-tomatoes','onion','spinach']:
    ings[i]['cat'] = 'fruit' if i=='banana' else 'veg'

def X(ing, amt, per='batch'): return {'ing':ing,'role':'X','fixed':amt,'per':per}
def R(ing, role, w=None):
    d={'ing':ing,'role':role}
    if w is not None: d['w']=w
    return d

old = json.load(open(glob.glob(os.path.join(DUMP,'recipes','*.json'))[0]))
recipes = {
 'tomato-chicken-potatoes': {**old, 'time':30, 'mode':'mixed',
   'steps':['Heat part of the oil in a large pan. Fry the chopped onion for 3–4 min until soft.',
            'Add the chicken in bite-size pieces with salt, pepper and paprika; sear 5–6 min.',
            'Add the tinned and cherry tomatoes; simmer 8–10 min until the sauce thickens.',
            'Meanwhile crisp the pre-cooked potatoes in a second pan or the airfryer (12–14 min, 175 °C) with the rest of the oil.',
            'Blend the cottage cheese smooth with a spoonful of hot sauce. Take the pan off the heat and stir it in. Do not boil it again.',
            'Combine with the potatoes, or keep separate if you portion per pan.'],
   'note':'Cottage cheese must be blended and added off the heat, otherwise it turns grainy.'},
 'garlic-chicken-rice-broccoli': {'name':'Garlic chicken, rice & broccoli','time':25,'mode':'split',
   'items':[R('chicken-breast','P'),R('basmati-rice','C'),R('olive-oil','F'),X('broccoli',800),X('garlic',15)],
   'steps':['Rinse the rice and boil it in plenty of salted water, 10–12 min; drain.',
            'Cut the chicken into cubes; season with salt, pepper and paprika.',
            'Heat the oil in a large pan, sear the chicken 6–7 min. Add the chopped garlic for the last minute.',
            'Steam or microwave the broccoli florets 4–5 min until just tender, then toss into the chicken pan.'],
   'note':'Rice (pan B) and chicken + broccoli (pan A) are weighed separately.'},
 'salmon-potato-traybake': {'name':'Salmon & potato tray bake','time':25,'mode':'split',
   'items':[R('salmon','P'),R('baby-potatoes','C'),R('olive-oil','F'),X('green-beans',600),X('lemon-juice',30)],
   'steps':['Heat the oven to 200 °C.',
            'Toss the pre-cooked potatoes with the oil, salt and pepper on a tray; roast 10 min.',
            'Add the green beans and the salmon fillets (skin down); roast 12–14 min more.',
            'Squeeze lemon over the salmon before portioning.'],
   'note':'Salmon carries more fat than a usual box target, so the app uses no oil and these boxes land higher in (mostly healthy, omega-3) fat and lower in carbs at the same calories. Raise “Fat g / box” in step 1 if you want the numbers to match. Cooked fish keeps 3 days in the fridge; freeze the rest.'},
 'chicken-thigh-fajita-rice': {'name':'Chicken thigh fajita rice','time':25,'mode':'split',
   'items':[R('chicken-thigh','P'),R('basmati-rice','C'),R('avocado-oil','F'),X('bell-pepper',600),X('onion',300)],
   'steps':['Boil the rice, 10–12 min; drain.',
            'Slice the chicken thighs, peppers and onion into strips. Season the chicken with cumin, paprika, garlic powder and salt.',
            'Heat the oil in a large pan on high heat; sear the chicken 6–7 min.',
            'Add the peppers and onion; stir-fry 5 min until softened but still crunchy.'],
   'note':'Avocado oil handles the high heat well.'},
 'chicken-egg-fried-rice': {'name':'Chicken & egg fried rice','time':25,'mode':'mixed',
   'items':[R('chicken-breast','P',75),R('eggs','P',25),R('basmati-rice','C'),R('avocado-oil','F'),
            X('peas-frozen',400),X('carrot',300),X('spring-onion',100),X('garlic',10)],
   'steps':['Boil the rice 10 min, drain and spread it out to steam dry (or use rice cooked the day before).',
            'Heat some oil in a wok or large pan; cook the diced chicken 6 min; push it aside.',
            'Scramble the eggs in the same pan.',
            'Add the rest of the oil, the diced carrot, peas and garlic; stir-fry 3 min.',
            'Add the rice, toss everything on high heat 3–4 min; season with soy sauce. Finish with spring onion.'],
   'note':'Shows two protein sources: the app splits protein 75/25 between chicken and eggs.'},
 'tuna-tomato-rice': {'name':'Tuna tomato rice skillet','time':20,'mode':'mixed',
   'items':[R('tuna-water','P'),R('basmati-rice','C'),R('olive-oil','F'),
            X('tinned-tomatoes',800),X('spinach',400),X('onion',200),X('garlic',10)],
   'steps':['Boil the rice, 10–12 min; drain.',
            'Fry the onion and garlic in the oil, 4 min.',
            'Add the tinned tomatoes; simmer 8 min. Stir in the spinach until wilted.',
            'Fold in the drained tuna and the rice; heat through 2 min.'],
   'note':'A pantry meal: everything except the spinach keeps for months.'},
 'sweet-potato-chicken-traybake': {'name':'Sweet potato chicken tray bake','time':30,'mode':'split',
   'items':[R('chicken-breast','P'),R('sweet-potato','C'),R('olive-oil','F'),X('courgette',600),X('onion',300)],
   'steps':['Heat the oven to 210 °C.',
            'Cube the sweet potato (skin on is fine); toss with half the oil and salt. Roast 10 min.',
            'Add the chicken cubes, courgette and onion wedges with the rest of the oil and spices; roast 18–20 min.'],
   'note':'Use two trays if needed so everything roasts instead of steaming.'},
}
meals = {
 'egg-spinach-scramble': {'name':'Egg, spinach & tomato scramble','items':[{'ing':'eggs','amt':3},{'ing':'spinach','amt':80},{'ing':'cherry-tomatoes','amt':100},{'ing':'olive-oil','amt':5}]},
 'mushroom-omelette': {'name':'Mushroom & spinach omelette','items':[{'ing':'eggs','amt':3},{'ing':'mushrooms','amt':100},{'ing':'spinach','amt':50},{'ing':'olive-oil','amt':5}]},
 'skyr-berry-bowl': {'name':'Skyr bowl with banana & berries','items':[{'ing':'skyr','amt':250},{'ing':'mixed-berries-frozen','amt':100},{'ing':'banana','amt':60}]},
}
for r in recipes.values():
    for it in r['items']: assert it['ing'] in ings, it
for m in meals.values():
    for it in m['items']: assert it['ing'] in ings, it
json.dump({'version':VERSION,'ingredients':ings,'recipes':recipes,'meals':meals}, open(OUT,'w'), indent=1, ensure_ascii=False)
print(len(ings),'ingredients',len(recipes),'recipes',len(meals),'breakfasts')
