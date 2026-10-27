"""Genera vs/assets/species.json (catálogo de especies → rig paramétrico).

    python tools/make_species.py vs/assets/species.json

Editar aquí y regenerar; el JSON es el que lee el Studio."""
# Genera vs/assets/species.json (catálogo de especies → rig paramétrico).
import json, sys
S = []
def sp(id, rig, name, es, en, env, size, params, actions=None):
    S.append({"id": id, "rig": rig, "name": name, "keywords_es": es, "keywords_en": en, "env": env, "size": size, "params": params})

Q = "quadruped"; B = "bird"; F = "fish"; O = "octopus"; I = "insect"; N = "snake"
# ---------------- cuadrúpedos
sp("dog", Q, "Perro", ["perro","perros","perra","perras","perrito","perritos","perrita","cachorro","cachorros","cachorrito"], ["dog","dogs","puppy","puppies"], "park", 0.36,
   {"bodyL":300,"bodyH":120,"legL":130,"legW":30,"neckL":60,"neckA":0.75,"neckW":64,"headR":52,"snout":46,"ears":"floppy","tail":"up","tailL":100,"tailW":14,"body":"#c88a4a","earC":"#8a5a2e","muzzle":"#e9c49a"})
sp("wolf", Q, "Lobo", ["lobo","lobos","loba"], ["wolf","wolves"], "forest", 0.4,
   {"bodyL":330,"bodyH":125,"legL":150,"legW":30,"neckL":60,"neckA":0.6,"neckW":70,"headR":52,"snout":58,"ears":"pointy","tail":"bushy","tailL":130,"tailW":16,"body":"#8b8f99","belly":"#d9dbe0","muzzle":"#cfd2d8"})
sp("fox", Q, "Zorro", ["zorro","zorros","zorra","zorrito"], ["fox","foxes"], "forest", 0.32,
   {"bodyL":280,"bodyH":100,"legL":110,"legW":24,"neckL":50,"neckA":0.6,"neckW":56,"headR":46,"snout":56,"ears":"pointy","earS":1.2,"tail":"bushy","tailL":150,"tailW":18,"body":"#e07a2c","belly":"#f6efe6","tailTip":"#ffffff","legC":"#3a2a22","muzzle":"#fbf3ea"})
sp("cat_big", Q, "Gatito", ["minino","michi","michis","gatita","gatitas"], ["kitty"], "home", 0.3,
   {"bodyL":260,"bodyH":100,"legL":105,"legW":24,"neckL":40,"neckA":0.7,"neckW":56,"headR":50,"snout":18,"ears":"pointy","tail":"up","tailL":130,"tailW":12,"body":"#9a9aa6","pattern":"stripes","whiskers":True,"eyeS":1.2,"eyeC":"#3e8f3a"})
sp("lion", Q, "León", ["leon","leones","leona","leonas","leoncito"], ["lion","lions","lioness"], "savanna", 0.42,
   {"bodyL":340,"bodyH":135,"legL":140,"legW":36,"neckL":40,"neckA":0.6,"neckW":80,"headR":58,"snout":40,"ears":"round","tail":"tuft","tailL":150,"tailW":10,"body":"#d9a35a","mane":"lion","maneC":"#8f4f1c","dark":"#5a3214","whiskers":True})
sp("tiger", Q, "Tigre", ["tigre","tigres","tigresa"], ["tiger","tigers"], "jungle", 0.42,
   {"bodyL":350,"bodyH":125,"legL":135,"legW":36,"neckL":40,"neckA":0.55,"neckW":78,"headR":56,"snout":36,"ears":"round","tail":"thin","tailL":160,"tailW":14,"body":"#ec8a2a","belly":"#fbf0de","dark":"#1f1612","pattern":"stripes","whiskers":True})
sp("leopard", Q, "Leopardo", ["leopardo","leopardos","jaguar","jaguares","pantera","panteras","guepardo","guepardos","chita"], ["leopard","jaguar","cheetah","panther"], "savanna", 0.4,
   {"bodyL":340,"bodyH":110,"legL":145,"legW":30,"neckL":45,"neckA":0.55,"neckW":66,"headR":48,"snout":34,"ears":"round","tail":"thin","tailL":170,"tailW":12,"body":"#e2b05a","belly":"#f8ecd4","dark":"#2a1c10","pattern":"rosettes","whiskers":True})
sp("bear", Q, "Oso", ["oso","osos","osa","osito","ositos"], ["bear","bears"], "forest", 0.44,
   {"bodyL":330,"bodyH":170,"legL":110,"legW":50,"neckL":30,"neckA":0.4,"neckW":100,"headR":64,"snout":40,"ears":"round","tail":"short","tailW":16,"body":"#6a4428","muzzle":"#b98a5a"})
sp("polar_bear", Q, "Oso polar", ["oso polar","osos polares"], ["polar bear","polar bears"], "snow", 0.44,
   {"bodyL":340,"bodyH":165,"legL":115,"legW":50,"neckL":50,"neckA":0.35,"neckW":95,"headR":56,"snout":46,"ears":"small","tail":"short","tailW":14,"body":"#f2f0ea","nose":"#1c1c1c","muzzle":"#ffffff"})
sp("panda", Q, "Panda", ["panda","pandas"], ["panda","pandas"], "forest", 0.4,
   {"bodyL":300,"bodyH":160,"legL":100,"legW":48,"neckL":25,"neckA":0.4,"neckW":100,"headR":66,"snout":26,"ears":"round","tail":"short","tailW":14,"body":"#f4f2ee","dark":"#1b1b1d","legC":"#1b1b1d","pattern":"panda","eyePatch":True,"muzzle":"#ffffff"})
sp("koala", Q, "Koala", ["koala","koalas"], ["koala","koalas"], "forest", 0.3,
   {"bodyL":200,"bodyH":140,"legL":70,"legW":38,"neckL":10,"neckA":0.6,"neckW":90,"headR":64,"snout":8,"ears":"round","earS":1.4,"tail":"none","body":"#9ea1a8","nose":"#2a2a2a"})
sp("horse", Q, "Caballo", ["caballo","caballos","yegua","yeguas","potro","potros","poni","ponis"], ["horse","horses","pony","foal"], "farm", 0.5,
   {"bodyL":340,"bodyH":135,"legL":210,"legW":30,"neckL":130,"neckA":0.95,"neckW":74,"headR":44,"snout":78,"snoutH":0.85,"ears":"pointy","earS":0.8,"tail":"long","tailL":150,"tailW":22,"body":"#8a5530","mane":"horse","maneC":"#2b1a10","hooves":True})
sp("zebra", Q, "Cebra", ["cebra","cebras"], ["zebra","zebras"], "savanna", 0.5,
   {"bodyL":330,"bodyH":130,"legL":200,"legW":30,"neckL":120,"neckA":0.95,"neckW":74,"headR":44,"snout":74,"snoutH":0.85,"ears":"pointy","earS":0.9,"tail":"tuft","tailL":120,"tailW":10,"body":"#f6f6f2","dark":"#161616","pattern":"stripes","mane":"short","maneC":"#161616","hooves":True,"muzzle":"#3a3a3a"})
sp("donkey", Q, "Burro", ["burro","burros","burra","asno","asnos","mula","mulas"], ["donkey","donkeys","mule"], "farm", 0.42,
   {"bodyL":300,"bodyH":125,"legL":170,"legW":28,"neckL":90,"neckA":0.8,"neckW":70,"headR":44,"snout":66,"ears":"long","earS":0.75,"tail":"tuft","tailL":110,"tailW":9,"body":"#8d8d8f","belly":"#e4e4e4","hooves":True,"muzzle":"#e8e8e8","mane":"short"})
sp("cow", Q, "Vaca", ["vaca","vacas","toro","toros","buey","bueyes","ternero","terneros","ternera","becerro"], ["cow","cows","bull","bulls","calf","cattle"], "farm", 0.46,
   {"bodyL":370,"bodyH":160,"legL":140,"legW":36,"neckL":40,"neckA":0.3,"neckW":90,"headR":52,"snout":48,"snoutH":0.9,"ears":"side","horns":"short","tail":"tuft","tailL":150,"tailW":8,"body":"#f5f3ee","dark":"#26221f","pattern":"patches","hooves":True,"muzzle":"#f0b3b8","nose":"#8a4a4f"})
sp("pig", Q, "Cerdo", ["cerdo","cerdos","cerda","cerdito","cerditos","chancho","chanchos","puerco","puercos","marrano","cochino","jabali"], ["pig","pigs","piglet","hog","boar"], "farm", 0.36,
   {"bodyL":300,"bodyH":150,"legL":75,"legW":30,"neckL":10,"neckA":0.3,"neckW":100,"headR":60,"snout":26,"ears":"pointy","earS":0.8,"tail":"curly","tailW":8,"body":"#f2a8b0","noseType":"pig","hooves":True,"earIn":"#e57f8c"})
sp("sheep", Q, "Oveja", ["oveja","ovejas","cordero","corderos","borrego","borregos","carnero"], ["sheep","lamb","lambs","ram"], "farm", 0.36,
   {"bodyL":290,"bodyH":150,"legL":110,"legW":20,"neckL":30,"neckA":0.5,"neckW":70,"headR":44,"snout":40,"ears":"side","tail":"short","tailW":16,"body":"#f6f2e6","wool":True,"legC":"#2a2622","muzzle":"#3a3430","hooves":True})
sp("goat", Q, "Cabra", ["cabra","cabras","chivo","chivos","cabrito"], ["goat","goats"], "farm", 0.36,
   {"bodyL":280,"bodyH":115,"legL":140,"legW":24,"neckL":60,"neckA":0.8,"neckW":56,"headR":42,"snout":44,"ears":"side","horns":"curved","hornC":"#bfae8e","tail":"short","tailW":12,"body":"#d8cfc0","beard":True,"hooves":True})
sp("deer", Q, "Ciervo", ["ciervo","ciervos","venado","venados","reno","renos","alce","alces","cervatillo","gacela","gacelas","antilope","antilopes"], ["deer","reindeer","moose","elk","gazelle","antelope"], "forest", 0.48,
   {"bodyL":300,"bodyH":115,"legL":190,"legW":22,"neckL":110,"neckA":1.0,"neckW":56,"headR":40,"snout":52,"ears":"pointy","earS":0.9,"horns":"antlers","tail":"short","tailW":14,"tailTip":"#ffffff","body":"#a86a3c","belly":"#f0dcc0","hooves":True,"pattern":"none"})
sp("giraffe", Q, "Jirafa", ["jirafa","jirafas"], ["giraffe","giraffes"], "savanna", 0.62,
   {"bodyL":270,"bodyH":125,"legL":250,"legW":24,"neckL":320,"neckA":1.15,"neckW":46,"headR":38,"snout":44,"ears":"pointy","earS":0.8,"horns":"ossicones","tail":"tuft","tailL":120,"tailW":8,"body":"#f0c060","dark":"#a45a1c","pattern":"blocks","hooves":True,"mane":"short","maneC":"#a45a1c"})
sp("elephant", Q, "Elefante", ["elefante","elefantes","elefanta","mamut","mamuts"], ["elephant","elephants","mammoth"], "savanna", 0.55,
   {"bodyL":380,"bodyH":220,"legL":150,"legW":70,"neckL":10,"neckA":0.3,"neckW":140,"headR":95,"snout":0,"ears":"elephant","tail":"thin","tailL":90,"tailW":8,"trunk":True,"tusks":True,"body":"#9a9ca6","eyeS":0.8,"trunkL":220})
sp("rhino", Q, "Rinoceronte", ["rinoceronte","rinocerontes","rino"], ["rhino","rhinoceros"], "savanna", 0.44,
   {"bodyL":380,"bodyH":180,"legL":100,"legW":56,"neckL":20,"neckA":0.2,"neckW":120,"headR":66,"snout":70,"snoutH":0.9,"ears":"pointy","earS":0.7,"horns":"rhino","tail":"thin","tailL":60,"tailW":6,"body":"#8e8a86","eyeS":0.8})
sp("hippo", Q, "Hipopótamo", ["hipopotamo","hipopotamos"], ["hippo","hippopotamus"], "savanna", 0.42,
   {"bodyL":380,"bodyH":190,"legL":80,"legW":56,"neckL":10,"neckA":0.2,"neckW":140,"headR":78,"snout":60,"snoutH":1.1,"ears":"small","tail":"short","tailW":10,"body":"#8d7c8e","belly":"#d6a7b0","muzzle":"#a8909e","eyeS":0.8})
sp("camel", Q, "Camello", ["camello","camellos","dromedario","dromedarios","alpaca","alpacas","vicuna","vicunas"], ["camel","camels","alpaca"], "desert", 0.5,
   {"bodyL":320,"bodyH":120,"legL":200,"legW":26,"neckL":140,"neckA":0.6,"neckW":52,"headR":40,"snout":54,"ears":"small","tail":"tuft","tailL":90,"tailW":8,"hump":0.9,"body":"#cf9f62","hooves":True})
sp("rabbit", Q, "Conejo", ["conejo","conejos","coneja","conejito","conejitos","liebre","liebres"], ["rabbit","rabbits","bunny","hare"], "park", 0.3,
   {"bodyL":180,"bodyH":110,"legL":60,"legW":30,"neckL":10,"neckA":0.8,"neckW":70,"headR":48,"snout":14,"ears":"long","earS":1.05,"tail":"short","tailW":20,"tailTip":"#ffffff","gait":"hop","body":"#c9b49e","whiskers":True,"nose":"#e48a96"})
sp("mouse", Q, "Ratón", ["raton","ratones","rata","ratas","ratoncito","hamster","hamsters"], ["mouse","mice","rat","rats","hamster"], "home", 0.2,
   {"bodyL":180,"bodyH":90,"legL":45,"legW":16,"neckL":10,"neckA":0.4,"neckW":60,"headR":40,"snout":34,"ears":"round","earS":1.3,"tail":"thin","tailL":200,"tailW":6,"body":"#9c948e","whiskers":True,"nose":"#e48a96","eyeS":1.1})
sp("squirrel", Q, "Ardilla", ["ardilla","ardillas"], ["squirrel","squirrels","chipmunk"], "forest", 0.2,
   {"bodyL":170,"bodyH":90,"legL":55,"legW":18,"neckL":20,"neckA":0.9,"neckW":50,"headR":38,"snout":20,"ears":"pointy","earS":0.8,"tail":"squirrel","tailL":200,"tailW":16,"gait":"hop","body":"#b8622c","belly":"#f3dcc0"})
sp("raccoon", Q, "Mapache", ["mapache","mapaches"], ["raccoon","raccoons"], "forest", 0.26,
   {"bodyL":220,"bodyH":110,"legL":70,"legW":24,"neckL":20,"neckA":0.5,"neckW":66,"headR":46,"snout":34,"ears":"pointy","earS":0.8,"tail":"bushy","tailL":130,"tailW":14,"ringed":True,"mask":True,"body":"#8e8a86","dark":"#2a2624","muzzle":"#ece8e2"})
sp("hedgehog", Q, "Erizo", ["erizo","erizos","puercoespin"], ["hedgehog","porcupine"], "forest", 0.24,
   {"bodyL":170,"bodyH":100,"legL":30,"legW":16,"neckL":0,"neckA":0.3,"neckW":60,"headR":36,"snout":34,"ears":"round","earS":0.6,"tail":"none","spines":True,"body":"#9a7a5a","dark":"#4a3628","muzzle":"#e8d4b8"})
sp("skunk", Q, "Zorrillo", ["zorrillo","mofeta","mofetas","zorrino"], ["skunk","skunks"], "forest", 0.24,
   {"bodyL":220,"bodyH":100,"legL":55,"legW":20,"neckL":15,"neckA":0.4,"neckW":60,"headR":40,"snout":30,"ears":"round","earS":0.6,"tail":"squirrel","tailL":170,"tailW":18,"body":"#1d1d22","pattern":"back_stripe","stripeC":"#f4f4f4","tailTip":"#f4f4f4"})
sp("beaver", Q, "Castor", ["castor","castores","nutria","nutrias"], ["beaver","beavers","otter","otters"], "forest", 0.26,
   {"bodyL":240,"bodyH":120,"legL":45,"legW":24,"neckL":10,"neckA":0.4,"neckW":80,"headR":46,"snout":30,"ears":"round","earS":0.5,"tail":"flat","tailC":"#4a3a32","body":"#7a5232","muzzle":"#a07a5a"})
sp("monkey", Q, "Mono", ["mono","monos","monito","monitos","chimpance","chimpances","simio","simios","macaco","macacos"], ["monkey","monkeys","chimp","chimpanzee"], "jungle", 0.38,
   {"tilt":0.42,"bodyL":190,"bodyH":115,"legL":110,"legW":24,"neckL":20,"neckA":0.9,"neckW":60,"headR":50,"snout":14,"ears":"round","earS":0.8,"tail":"curl","tailL":160,"tailW":10,"body":"#6b4a30","muzzle":"#e3c3a0","earIn":"#e3c3a0"})
sp("gorilla", Q, "Gorila", ["gorila","gorilas","orangutan","orangutanes"], ["gorilla","gorillas","orangutan","ape","apes"], "jungle", 0.46,
   {"tilt":0.5,"bodyL":230,"bodyH":170,"legL":100,"legW":46,"neckL":10,"neckA":0.6,"neckW":90,"headR":56,"snout":16,"ears":"small","tail":"none","body":"#2e2a2c","muzzle":"#5a4e50","earIn":"#5a4e50"})
sp("kangaroo", Q, "Canguro", ["canguro","canguros"], ["kangaroo","kangaroos"], "desert", 0.46,
   {"bodyL":220,"bodyH":130,"legL":120,"legW":32,"neckL":60,"neckA":1.1,"neckW":56,"headR":40,"snout":44,"ears":"long","earS":0.7,"tail":"thick","tailL":200,"gait":"hop","body":"#c08454","tilt":0.8,"frontArms":True})
sp("crocodile", Q, "Cocodrilo", ["cocodrilo","cocodrilos","caiman","caimanes","lagarto","lagartos","aligator"], ["crocodile","crocodiles","alligator","caiman"], "river", 0.42,
   {"bodyL":420,"bodyH":90,"legL":42,"legW":26,"neckL":10,"neckA":0.05,"neckW":80,"headR":44,"snout":130,"snoutH":0.6,"ears":"none","tail":"reptile","tailL":360,"body":"#4f7a3a","belly":"#c9c48a","dark":"#2f4a22","pattern":"spots","eyeS":1.0,"crest":True,"crestC":"#3a5a2a"})
sp("lizard", Q, "Lagartija", ["lagartija","lagartijas","iguana","iguanas","camaleon","camaleones","geco","dragon","dragones"], ["lizard","lizards","iguana","chameleon","gecko","dragon"], "desert", 0.32,
   {"bodyL":240,"bodyH":60,"legL":34,"legW":16,"neckL":20,"neckA":0.2,"neckW":46,"headR":30,"snout":40,"snoutH":0.6,"ears":"none","tail":"reptile","tailL":260,"body":"#6fae3a","belly":"#e4d68a","dark":"#3a6a22","pattern":"spots","crest":True,"crestC":"#3a6a22"})
sp("turtle", Q, "Tortuga", ["tortuga","tortugas"], ["turtle","turtles","tortoise"], "river", 0.32,
   {"bodyL":240,"bodyH":90,"legL":40,"legW":30,"neckL":40,"neckA":0.3,"neckW":34,"headR":30,"snout":24,"ears":"none","tail":"short","tailW":10,"shell":True,"shellC":"#6a8a3a","body":"#9ab06a"})
sp("frog", Q, "Rana", ["rana","ranas","sapo","sapos","renacuajo"], ["frog","frogs","toad","toads"], "river", 0.28,
   {"bodyL":170,"bodyH":110,"legL":40,"legW":34,"neckL":0,"neckA":0.3,"neckW":60,"headR":58,"snout":12,"ears":"none","tail":"none","gait":"hop","body":"#5bb04a","belly":"#e8f0a0","eyeS":1.5,"pattern":"spots","dark":"#3a7a2a"})
sp("dinosaur", Q, "Dinosaurio", ["dinosaurio","dinosaurios","brontosaurio","diplodoco"], ["dinosaur","dinosaurs","brontosaurus","diplodocus"], "jungle", 0.62,
   {"bodyL":360,"bodyH":180,"legL":150,"legW":52,"neckL":300,"neckA":0.95,"neckW":60,"headR":40,"snout":34,"ears":"none","tail":"reptile","tailL":380,"body":"#6aa060","belly":"#c8dca0","dark":"#4a7a40","pattern":"spots"})
sp("bat_q", Q, "Perezoso", ["perezoso","perezosos"], ["sloth","sloths"], "jungle", 0.3,
   {"bodyL":200,"bodyH":120,"legL":90,"legW":20,"neckL":20,"neckA":0.6,"neckW":60,"headR":46,"snout":14,"ears":"none","tail":"none","body":"#9a8468","eyePatch":True,"dark":"#4a3a2a","muzzle":"#e6d6bc"})
# ---------------- aves
sp("hen", B, "Gallina", ["gallina","gallinas","pollo","pollos","gallo","gallos"], ["chicken","chickens","hen","hens","rooster"], "farm", 0.3,
   {"bodyRx":90,"bodyRy":70,"tilt":0.35,"neckL":30,"neckW":46,"headR":32,"beak":"short","beakL":24,"legL":70,"crest":"comb","wattle":True,"tail":"upright","tailL":80,"body":"#c86a2e","belly":"#d98a4a","wingC":"#a8521e","tailC":"#2b2a3a","headC":"#d98a4a"})
sp("chick", B, "Pollito", ["pollito","pollitos","polluelo","polluelos"], ["chick","chicks"], "farm", 0.16,
   {"bodyRx":60,"bodyRy":56,"tilt":0.4,"neckL":0,"neckW":40,"headR":36,"beak":"short","beakL":16,"legL":40,"tail":"short","tailL":24,"body":"#ffd84a","belly":"#ffe88a","wingC":"#f2c43a"})
sp("duck", B, "Pato", ["pato","patos","patito","patitos","ganso","gansos","oca","ocas"], ["duck","ducks","duckling","goose","geese"], "river", 0.28,
   {"bodyRx":100,"bodyRy":58,"tilt":0.1,"neckL":44,"neckA":1.35,"neckW":36,"headR":32,"beak":"flat","beakL":36,"beakC":"#f2a72a","legL":40,"legC":"#f2a72a","feet":"web","tail":"short","tailL":40,"body":"#b8a58a","belly":"#e4d8c4","headC":"#2e7a4a","collar":"#ffffff","wingC":"#8a7a64"})
sp("swan", B, "Cisne", ["cisne","cisnes"], ["swan","swans"], "river", 0.36,
   {"bodyRx":110,"bodyRy":60,"tilt":0.05,"neckL":120,"neckA":1.45,"neckW":30,"headR":28,"beak":"flat","beakL":34,"beakC":"#f07a2a","legL":30,"legC":"#2a2a2a","feet":"web","tail":"short","tailL":40,"body":"#fbfbf8","mask":"#1d1d1d"})
sp("owl", B, "Búho", ["buho","buhos","lechuza","lechuzas","mochuelo"], ["owl","owls"], "forest", 0.3,
   {"bodyRx":66,"bodyRy":86,"tilt":1.3,"neckL":0,"neckW":60,"headR":54,"beak":"hook","beakL":14,"beakC":"#e2b23a","legL":30,"legC":"#d8a23a","crest":"tuft","tail":"short","tailL":40,"body":"#8a6a4a","belly":"#d9c4a0","wingC":"#6a4e34","headC":"#9a7a5a","eyeBig":True,"eyeC":"#f2a21a","spots":"#5a4230"})
sp("eagle", B, "Águila", ["aguila","aguilas","halcon","halcones","buitre","buitres","condor","condores","gavilan"], ["eagle","eagles","hawk","falcon","vulture","condor"], "sky", 0.4,
   {"bodyRx":110,"bodyRy":66,"tilt":0.55,"neckL":30,"neckW":50,"headR":34,"beak":"hook","beakL":34,"beakC":"#f2c23a","legL":60,"legC":"#f2c23a","tail":"short","tailL":80,"body":"#5a3a22","belly":"#6a4a2e","wingC":"#4a2e1a","headC":"#f4f2ea","neckC":"#f4f2ea","flapHz":1.4})
sp("parrot", B, "Loro", ["loro","loros","cotorra","cotorras","papagayo","papagayos","guacamayo","guacamayos","perico","pericos"], ["parrot","parrots","macaw","parakeet"], "jungle", 0.3,
   {"bodyRx":70,"bodyRy":56,"tilt":0.9,"neckL":10,"neckW":46,"headR":36,"beak":"hook","beakL":26,"beakC":"#2a2a2a","legL":36,"legC":"#6a6a6a","tail":"long","tailL":110,"body":"#e2322a","belly":"#e2322a","wingC":"#2a7ae2","tailC":"#2a7ae2","headC":"#e2322a","eyeRing":"#ffffff","flapHz":3.5})
sp("crow", B, "Cuervo", ["cuervo","cuervos","urraca","urracas","mirlo"], ["crow","crows","raven","magpie","blackbird"], "park", 0.28,
   {"bodyRx":80,"bodyRy":54,"tilt":0.35,"neckL":20,"neckW":40,"headR":30,"beak":"short","beakL":34,"beakC":"#1a1a1a","legL":60,"legC":"#2a2a2a","tail":"short","tailL":70,"body":"#24262e","wingC":"#1a1c22","headC":"#2a2c34"})
sp("sparrow", B, "Pájaro", ["pajarito","pajaritos","gorrion","gorriones","canario","canarios","golondrina","golondrinas","jilguero","jilgueros"], ["sparrow","canary","swallow","finch"], "park", 0.2,
   {"bodyRx":64,"bodyRy":46,"tilt":0.45,"neckL":6,"neckW":40,"headR":30,"beak":"short","beakL":16,"beakC":"#3a3028","legL":40,"legC":"#8a6a4a","tail":"fork","tailL":50,"body":"#9a6a3e","belly":"#ecdcc0","wingC":"#6a4a2a","headC":"#8a5a32","cheek":"#f0e4d0","flapHz":5})
sp("seagull", B, "Gaviota", ["gaviota","gaviotas","albatros","pelicano","pelicanos"], ["seagull","gull","albatross","pelican"], "ocean_shore", 0.3,
   {"bodyRx":90,"bodyRy":52,"tilt":0.25,"neckL":20,"neckW":40,"headR":30,"beak":"short","beakL":34,"beakC":"#f2c23a","legL":60,"legC":"#f2a23a","feet":"web","tail":"short","tailL":50,"body":"#f4f4f2","wingC":"#9aa2ae","flapHz":1.6})
sp("penguin", B, "Pingüino", ["pinguino","pinguinos","pingüino","pingüinos"], ["penguin","penguins"], "snow", 0.32,
   {"bodyRx":64,"bodyRy":96,"tilt":1.4,"neckL":0,"neckW":60,"headR":40,"beak":"short","beakL":28,"beakC":"#f2a23a","legL":14,"legC":"#f2a23a","feet":"web","tail":"short","tailL":20,"wings":"flipper","body":"#1f2430","belly":"#fbfbf8","wingC":"#1a1e28","headC":"#1f2430","cheek":"#f2c23a"})
sp("flamingo", B, "Flamenco", ["flamenco","flamencos"], ["flamingo","flamingos"], "river", 0.55,
   {"bodyRx":80,"bodyRy":50,"tilt":0.2,"neckL":150,"neckA":1.35,"neckW":20,"headR":24,"beak":"bent","beakL":40,"beakC":"#f2e4e0","legL":220,"legC":"#f08aa0","tail":"short","tailL":30,"body":"#f58fa8","wingC":"#f06a8a","headC":"#f58fa8"})
sp("ostrich", B, "Avestruz", ["avestruz","avestruces","emu","emus","nandu"], ["ostrich","emu"], "savanna", 0.55,
   {"bodyRx":110,"bodyRy":80,"tilt":0.2,"neckL":170,"neckA":1.4,"neckW":24,"headR":26,"beak":"flat","beakL":26,"beakC":"#e2b49a","legL":200,"legC":"#e2b49a","tail":"upright","tailL":60,"body":"#2a2624","wingC":"#3a3430","tailC":"#f4f4f2","headC":"#d8a890","neckC":"#e2b49a"})
sp("peacock", B, "Pavo real", ["pavo real","pavos reales","pavorreal"], ["peacock","peafowl"], "park", 0.42,
   {"bodyRx":80,"bodyRy":56,"tilt":0.4,"neckL":70,"neckA":1.3,"neckW":30,"headR":24,"beak":"short","beakL":18,"legL":80,"crest":"crest","crestC":"#2a6ae2","tail":"fan","tailL":120,"tailC":"#1e8a5a","eyespot":"#2a4ae2","body":"#1e5ad2","wingC":"#2a8a8a","headC":"#1e5ad2"})
sp("turkey", B, "Pavo", ["pavo","pavos","guajolote"], ["turkey","turkeys"], "farm", 0.36,
   {"bodyRx":100,"bodyRy":80,"tilt":0.35,"neckL":40,"neckW":30,"headR":26,"beak":"short","beakL":16,"legL":70,"wattle":True,"crestC":"#d8322e","tail":"fan","tailL":90,"tailC":"#6a4a2a","eyespot":"#c89a5a","body":"#4a3424","headC":"#9ab0e2","neckC":"#e25a5a"})
sp("hummingbird", B, "Colibrí", ["colibri","colibries","picaflor"], ["hummingbird","hummingbirds"], "jungle", 0.18,
   {"bodyRx":50,"bodyRy":30,"tilt":0.6,"neckL":0,"neckW":30,"headR":22,"beak":"needle","beakL":56,"beakC":"#1a1a1a","legL":10,"tail":"fork","tailL":40,"body":"#2ab07a","belly":"#e4f4ea","wingC":"#8ad4b0","headC":"#2ab07a","hover":True,"flapHz":7.5})
sp("toucan", B, "Tucán", ["tucan","tucanes"], ["toucan","toucans"], "jungle", 0.3,
   {"bodyRx":66,"bodyRy":60,"tilt":0.85,"neckL":0,"neckW":46,"headR":34,"beak":"big","beakL":80,"beakC":"#f2a22a","beakTip":"#e2322a","legL":30,"legC":"#3a6ae2","tail":"long","tailL":80,"body":"#1d1d22","belly":"#f8f0d0","wingC":"#16161a","eyeRing":"#7ad2f2"})
sp("woodpecker", B, "Pájaro carpintero", ["carpintero","carpinteros"], ["woodpecker","woodpeckers"], "forest", 0.24,
   {"bodyRx":64,"bodyRy":46,"tilt":0.9,"neckL":10,"neckW":40,"headR":30,"beak":"short","beakL":34,"beakC":"#3a3a3a","legL":30,"crest":"crest","crestC":"#e2322a","tail":"short","tailL":50,"body":"#2a2a2e","belly":"#f4f4f0","wingC":"#1e1e22","spots":"#f4f4f0"})
sp("bat", B, "Murciélago", ["murcielago","murcielagos","vampiro"], ["bat","bats"], "night", 0.26,
   {"bodyRx":44,"bodyRy":40,"tilt":0.5,"neckL":0,"neckW":40,"headR":30,"beak":"snout","beakL":16,"beakC":"#4a3a3e","legL":12,"legC":"#3a2e30","crest":"tuft","tail":"short","tailL":10,"wings":"membrane","body":"#4a3a3e","belly":"#6a5658","wingC":"#3a2c30","headC":"#4a3a3e","hover":True,"flapHz":4})
# ---------------- agua
sp("fish", F, "Pez", ["pez","peces","pescado","pescados","pececito","pececitos","salmon","salmones","trucha","truchas","atun","sardina","sardinas","bacalao"], ["fish","fishes","salmon","trout","tuna","sardine"], "ocean", 0.36,
   {"bodyL":300,"bodyH":120,"shape":"fish","tailT":"fork","dorsal":"tri","body":"#4a9ad2","belly":"#e4f2fa","fin":"#2a6aa2","stripes":"#2a5a8a"})
sp("goldfish", F, "Pez dorado", ["pez dorado","peces dorados","carpa","carpas","koi"], ["goldfish","carp","koi"], "ocean", 0.32,
   {"bodyL":240,"bodyH":140,"shape":"fish","tailT":"round","dorsal":"tri","body":"#f28a2a","belly":"#ffd08a","fin":"#f2a24a","eyeS":1.3})
sp("clownfish", F, "Pez payaso", ["pez payaso","peces payaso","nemo"], ["clownfish","nemo"], "ocean", 0.3,
   {"bodyL":240,"bodyH":120,"shape":"fish","tailT":"round","dorsal":"long","body":"#f27a1a","belly":"#f8a24a","fin":"#f27a1a","bands":"#ffffff","eyeS":1.3})
sp("piranha", F, "Piraña", ["piraña","pirañas","pirana","piranas"], ["piranha","piranhas"], "river_under", 0.3,
   {"bodyL":240,"bodyH":160,"shape":"fish","tailT":"fork","dorsal":"small","body":"#8a9aa2","belly":"#e25a3a","fin":"#5a6a72","teeth":True,"spots":"#c8d2d8"})
sp("shark", F, "Tiburón", ["tiburon","tiburones","escualo"], ["shark","sharks"], "ocean", 0.55,
   {"bodyL":420,"bodyH":120,"shape":"shark","tailT":"shark","dorsal":"tri","body":"#7a8a9a","belly":"#f2f4f6","fin":"#6a7a8a","teeth":True,"eyeS":0.8})
sp("dolphin", F, "Delfín", ["delfin","delfines","marsopa"], ["dolphin","dolphins","porpoise"], "ocean", 0.5,
   {"bodyL":380,"bodyH":110,"shape":"dolphin","tailT":"fluke","dorsal":"tri","body":"#7a96b2","belly":"#e8eef4","fin":"#6a86a2"})
sp("whale", F, "Ballena", ["ballena","ballenas","ballenato","cachalote"], ["whale","whales","sperm whale"], "ocean", 0.8,
   {"bodyL":520,"bodyH":180,"shape":"whale","tailT":"fluke","dorsal":"small","body":"#3a5a8a","belly":"#c8d8e8","fin":"#2a4a7a","blowhole":True,"eyeS":0.7})
sp("orca", F, "Orca", ["orca","orcas"], ["orca","orcas","killer whale"], "ocean", 0.6,
   {"bodyL":420,"bodyH":140,"shape":"dolphin","tailT":"fluke","dorsal":"sail","body":"#1d1f26","belly":"#fafafa","fin":"#16181e"})
sp("seahorse_eel", F, "Anguila", ["anguila","anguilas","morena","morenas"], ["eel","eels","moray"], "ocean", 0.32,
   {"bodyL":460,"bodyH":60,"shape":"fish","tailT":"round","dorsal":"long","body":"#6a7a3a","belly":"#c8c88a","fin":"#5a6a2a","spots":"#3a4a1a"})
sp("octopus", O, "Pulpo", ["pulpo","pulpos"], ["octopus","octopuses"], "ocean", 0.42, {"kind":"octopus","R":110,"armL":230,"body":"#d8566b","spots":"#f2a0ac"})
sp("squid", O, "Calamar", ["calamar","calamares","sepia"], ["squid","cuttlefish"], "ocean", 0.42, {"kind":"squid","R":80,"armL":220,"body":"#e8a07a","spots":"#c8604a"})
sp("jellyfish", O, "Medusa", ["medusa","medusas","agua viva","aguaviva"], ["jellyfish"], "ocean", 0.38, {"kind":"jellyfish","R":100,"armL":260,"body":"#b88ae8","glow":True})
# ---------------- insectos
sp("ant", I, "Hormiga", ["hormiga","hormigas","termita","termitas"], ["ant","ants","termite"], "park_close", 0.3,
   {"kind":"ant","headR":30,"thoraxR":22,"abdRx":46,"abdRy":34,"legL":70,"body":"#3a1e16","antL":70})
sp("bee", I, "Abeja", ["abeja","abejas","avispa","avispas","abejorro","abejorros"], ["bee","bees","wasp","wasps","bumblebee"], "park_close", 0.3,
   {"kind":"bee","headR":28,"thoraxR":30,"abdRx":50,"abdRy":38,"legL":50,"body":"#2a2420","abd":"#f2c22a","stripes":"#1d1a18","wings":"clear","stinger":True,"antL":50,"hover":True,"eyeBig":True,"eyeC":"#1d1a18"})
sp("fly", I, "Mosca", ["mosca","moscas","moscardon"], ["housefly","houseflies"], "home", 0.26,
   {"kind":"fly","headR":28,"thoraxR":30,"abdRx":40,"abdRy":30,"legL":50,"body":"#2a2e34","wings":"clear","antL":20,"eyeBig":True,"eyeC":"#a2261e","hover":True})
sp("mosquito", I, "Mosquito", ["mosquito","mosquitos","zancudo","zancudos"], ["mosquito","mosquitoes","gnat"], "night", 0.28,
   {"kind":"mosquito","headR":18,"thoraxR":20,"abdRx":56,"abdRy":14,"legL":110,"body":"#4a4036","wings":"clear","antL":40,"proboscis":True,"hover":True})
sp("butterfly", I, "Mariposa", ["mariposa","mariposas","polilla","polillas"], ["butterfly","butterflies","moth","moths"], "park_close", 0.36,
   {"kind":"butterfly","headR":18,"thoraxR":18,"abdRx":44,"abdRy":12,"legL":40,"body":"#2a2420","wings":"butterfly","wingC":"#f28a1a","wingC2":"#ffd24a","antL":60,"hover":True})
sp("ladybug", I, "Mariquita", ["mariquita","mariquitas","catarina","catarinas","vaquita"], ["ladybug","ladybugs","ladybird"], "park_close", 0.26,
   {"kind":"ladybug","headR":22,"thoraxR":26,"abdRx":46,"abdRy":34,"legL":34,"body":"#1d1d1d","wings":"shell","wingC":"#e2221e","spots":"#151515","antL":24})
sp("beetle", I, "Escarabajo", ["escarabajo","escarabajos","cucaracha","cucarachas"], ["beetle","beetles","cockroach","cockroaches"], "park_close", 0.3,
   {"kind":"beetle","headR":24,"thoraxR":28,"abdRx":56,"abdRy":34,"legL":50,"body":"#3a2418","wings":"shell","wingC":"#5a3a1a","antL":60})
sp("grasshopper", I, "Saltamontes", ["saltamontes","grillo","grillos","langosta","langostas","chapulin"], ["grasshopper","cricket","locust"], "park_close", 0.32,
   {"kind":"grasshopper","headR":26,"thoraxR":24,"abdRx":64,"abdRy":20,"legL":70,"body":"#6aa83a","wings":"long","wingC":"#8ac84a","jumpLegs":True,"antL":90})
sp("dragonfly", I, "Libélula", ["libelula","libelulas"], ["dragonfly","dragonflies"], "river", 0.34,
   {"kind":"dragonfly","headR":22,"thoraxR":20,"abdRx":80,"abdRy":10,"legL":30,"body":"#2a8ab2","wings":"long","wingC":"#cfeaff","eyeBig":True,"eyeC":"#1a5a8a","antL":10,"hover":True})
sp("firefly", I, "Luciérnaga", ["luciernaga","luciernagas"], ["firefly","fireflies"], "night", 0.26,
   {"kind":"firefly","headR":20,"thoraxR":24,"abdRx":40,"abdRy":24,"legL":40,"body":"#3a2e22","wings":"shell","wingC":"#5a4a32","glow":"#e8ff6a","antL":40,"hover":True})
# ---------------- serpientes, gusanos, caracoles
sp("snake", N, "Serpiente", ["serpiente","serpientes","culebra","culebras","vibora","viboras","boa","boas","piton","anaconda","anacondas"], ["snake","snakes","serpent","viper","python","boa","anaconda"], "jungle", 0.42,
   {"kind":"snake","L":560,"W":44,"body":"#5c8f3a","pattern":"bands","dark":"#2f5a1e"})
sp("cobra", N, "Cobra", ["cobra","cobras"], ["cobra","cobras"], "desert", 0.5,
   {"kind":"snake","L":520,"W":44,"body":"#c8a24a","pattern":"rings","hood":True,"headT":"round"})
sp("rattlesnake", N, "Serpiente de cascabel", ["cascabel","serpiente de cascabel","serpientes de cascabel"], ["rattlesnake","rattlesnakes"], "desert", 0.42,
   {"kind":"snake","L":520,"W":44,"body":"#b8925a","pattern":"diamonds","dark":"#5a3a1e","headT":"tri","rattle":True})
sp("worm", N, "Gusano", ["gusano","gusanos","lombriz","lombrices","oruga","orugas"], ["worm","worms","earthworm","caterpillar"], "park_close", 0.3,
   {"kind":"worm","L":300,"W":40,"body":"#e48a9a","pattern":"rings"})
sp("snail", N, "Caracol", ["caracol","caracoles","babosa","babosas"], ["snail","snails","slug"], "park_close", 0.32,
   {"kind":"snail","L":220,"W":36,"body":"#c8b48a","pattern":"none","shellC":"#b07a3e"})

# ---------------- más especies frecuentes en guiones
sp("capybara", Q, "Capibara", ["capibara","capibaras","carpincho","carpinchos","chiguire"], ["capybara","capybaras"], "river", 0.34,
   {"bodyL":280,"bodyH":150,"legL":70,"legW":30,"neckL":10,"neckA":0.3,"neckW":100,"headR":56,"snout":40,"snoutH":1.0,"ears":"small","tail":"none","body":"#9a6a42","muzzle":"#8a5a36","nose":"#3a2a22"})
sp("hyena", Q, "Hiena", ["hiena","hienas"], ["hyena","hyenas"], "savanna", 0.38,
   {"tilt":0.18,"bodyL":300,"bodyH":125,"legL":140,"legW":28,"neckL":60,"neckA":0.5,"neckW":76,"headR":50,"snout":40,"ears":"round","earS":0.9,"tail":"bushy","tailL":90,"tailW":12,"body":"#b89a6a","dark":"#4a3a2a","pattern":"spots","mane":"short","maneC":"#4a3a2a"})
sp("badger", Q, "Tejón", ["tejon","tejones","topo","topos"], ["badger","badgers","mole","moles"], "forest", 0.24,
   {"bodyL":240,"bodyH":100,"legL":40,"legW":24,"neckL":10,"neckA":0.3,"neckW":70,"headR":42,"snout":40,"ears":"small","tail":"short","tailW":12,"body":"#6a6a70","pattern":"back_stripe","stripeC":"#e8e8e8","mask":True,"dark":"#1d1d22"})
sp("armadillo", Q, "Armadillo", ["armadillo","armadillos","pangolin"], ["armadillo","armadillos","pangolin"], "desert", 0.26,
   {"bodyL":220,"bodyH":100,"legL":38,"legW":20,"neckL":10,"neckA":0.2,"neckW":46,"headR":34,"snout":46,"ears":"pointy","earS":0.8,"tail":"thin","tailL":110,"tailW":14,"shell":True,"shellC":"#a89070","body":"#c8a88a"})
sp("anteater", Q, "Oso hormiguero", ["oso hormiguero","osos hormigueros","hormiguero"], ["anteater","anteaters"], "jungle", 0.4,
   {"bodyL":320,"bodyH":130,"legL":110,"legW":30,"neckL":40,"neckA":0.1,"neckW":70,"headR":36,"snout":130,"snoutH":0.45,"ears":"small","tail":"bushy","tailL":170,"tailW":22,"body":"#8a7a62","pattern":"back_stripe","stripeC":"#2a2622"})
sp("platypus", Q, "Ornitorrinco", ["ornitorrinco","ornitorrincos"], ["platypus","platypuses"], "river", 0.28,
   {"bodyL":230,"bodyH":90,"legL":36,"legW":22,"neckL":10,"neckA":0.2,"neckW":70,"headR":36,"snout":60,"snoutH":0.6,"muzzle":"#3a3a3e","nose":"#2a2a2e","ears":"none","tail":"flat","tailC":"#6a4a32","body":"#7a5a3e"})
sp("axolotl", Q, "Ajolote", ["ajolote","ajolotes","axolote","salamandra","salamandras","triton"], ["axolotl","axolotls","salamander","newt"], "river_under", 0.3,
   {"bodyL":220,"bodyH":70,"legL":34,"legW":16,"neckL":10,"neckA":0.2,"neckW":60,"headR":44,"snout":10,"ears":"none","tail":"reptile","tailL":200,"crest":True,"crestC":"#e86a9a","body":"#f4b0c8","belly":"#fbd8e4","eyeS":1.1,"habitat":"water"})
sp("trex", Q, "Tiranosaurio", ["tiranosaurio","tiranosaurios","t-rex","trex","velociraptor","velociraptores","raptor"], ["t-rex","trex","tyrannosaurus","velociraptor","raptor"], "jungle", 0.6,
   {"tilt":0.55,"frontArms":True,"bodyL":320,"bodyH":150,"legL":170,"legW":48,"neckL":60,"neckA":0.5,"neckW":90,"headR":60,"snout":90,"snoutH":0.8,"ears":"none","tail":"reptile","tailL":330,"body":"#6a8a4a","belly":"#d8d8a0","dark":"#3a5a2a","pattern":"stripes","eyeS":0.9})
sp("seal", F, "Foca", ["foca","focas","lobo marino","lobos marinos","leon marino","leones marinos","morsa","morsas","manati","manaties"], ["seal","seals","sea lion","walrus","manatee"], "ocean", 0.42,
   {"bodyL":320,"bodyH":130,"shape":"dolphin","tailT":"round","dorsal":"none","body":"#8a8a92","belly":"#c8c8cc","fin":"#6a6a72","eyeS":1.6})
sp("seahorse", F, "Caballito de mar", ["caballito de mar","caballitos de mar","hipocampo"], ["seahorse","seahorses"], "ocean", 0.28,
   {"bodyL":160,"bodyH":120,"shape":"fish","tailT":"round","dorsal":"small","body":"#f2b23a","belly":"#f8d88a","fin":"#e29a2a","eyeS":1.2})
sp("starfish_ray", F, "Mantarraya", ["mantarraya","mantarrayas","raya","rayas","manta"], ["stingray","manta","ray"], "ocean", 0.5,
   {"bodyL":300,"bodyH":90,"shape":"fish","tailT":"fork","dorsal":"none","body":"#5a6a7a","belly":"#e8eef4","fin":"#4a5a6a","spots":"#8a9aaa"})
sp("mantis", I, "Mantis", ["mantis","mantis religiosa","santateresa"], ["mantis","praying mantis"], "park_close", 0.32,
   {"kind":"grasshopper","headR":26,"thoraxR":18,"abdRx":70,"abdRy":18,"legL":80,"body":"#7ac83a","wings":"long","wingC":"#a8e86a","jumpLegs":False,"antL":60,"eyeBig":True,"eyeC":"#3a8a2a"})
sp("pterodactyl", B, "Pterodáctilo", ["pterodactilo","pterodactilos","pteranodon","dragon volador"], ["pterodactyl","pteranodon"], "sky", 0.46,
   {"bodyRx":70,"bodyRy":40,"tilt":0.4,"neckL":50,"neckW":30,"headR":30,"beak":"needle","beakL":90,"beakC":"#c8a26a","legL":40,"legC":"#8a6a4a","crest":"crest","crestC":"#c86a3a","tail":"short","tailL":20,"wings":"membrane","body":"#a8784a","wingC":"#c8945a","headC":"#a8784a","flapHz":1.4,"hover":True})

seen = {}
for s in S:
    for k in s["keywords_es"] + s["keywords_en"]:
        if k in seen and seen[k] != s["id"]:
            print("DUP", k, seen[k], s["id"], file=sys.stderr)
        seen[k] = s["id"]
out = {"schema_version": 1, "note": "Catálogo de especies → rig paramétrico del motor vectorial (engine/63_vector_creatures.js). "
       "size = fracción de min(ancho, alto) que ocupa el animal (de alto; de ancho si es alargado). env = escenario por defecto.",
       "species": S}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
print(len(S), "especies")
