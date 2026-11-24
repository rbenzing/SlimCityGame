# Changelog

## [1.103.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.102.1...slimcity-v1.103.0) (2026-11-24)


### Features

* **roads:** the centred cul-de-sac, a turning circle on its street's own centre line ([f19cf84](https://github.com/rbenzing/SlimCityGame/commit/f19cf84f3131a9ae654b21a8b838fadf9ad3f723))
* **roads:** the centred roundabout drawn, picked by the tool, and framed ([4dc96b4](https://github.com/rbenzing/SlimCityGame/commit/4dc96b4b24cbde3b2dd5e18ad5665956b883c3b6))
* **roads:** the centred roundabout in the sim: code, plan, commands, graph and frontage ([a7462c6](https://github.com/rbenzing/SlimCityGame/commit/a7462c6fc6215e5b25c189b0a447670ce1a7ac91))

## [1.102.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.102.0...slimcity-v1.102.1) (2026-11-23)


### Bug Fixes

* **sim:** the happiness average refreshes where the sim moves, never in postSnapshot ([e6f56f6](https://github.com/rbenzing/SlimCityGame/commit/e6f56f68b3b440ec8011451cdcc7e7f27c546f04))
* **tools:** settle flushes the page's queued road, lamp and tree work before counting frames ([0d4c0c2](https://github.com/rbenzing/SlimCityGame/commit/0d4c0c2c4c0f49ef956dfc1b04d210ee9614e98f))


### Performance Improvements

* **render:** a snapshot's road work follows what changed, paced over frames ([bc54bd4](https://github.com/rbenzing/SlimCityGame/commit/bc54bd475a549680787c0f48b4413b465d5e6e8c))
* the worker posts one snapshot at a time, a control change stops at the next junction, road chunks drain by time ([a42b51c](https://github.com/rbenzing/SlimCityGame/commit/a42b51c93b6ba96a588083f95c449160ffa8ce78))

## [1.102.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.101.0...slimcity-v1.102.0) (2026-11-23)


### Features

* **tools:** road classes, paint, bends and edges series; grade close boxes; along view starts inside the run ([6a2213c](https://github.com/rbenzing/SlimCityGame/commit/6a2213cc0b652718b45d1d3d4fef67577830a132))
* **tools:** the curve, farm and first-game shots move into town series; the playthrough becomes a probe ([ac0d3b3](https://github.com/rbenzing/SlimCityGame/commit/ac0d3b31bd192f62bead2e0838f545e2a8c7525f))
* **tools:** the measuring tools become probes, the dropped road audits come back, the old shot runner goes ([a891310](https://github.com/rbenzing/SlimCityGame/commit/a8913104002b574a98d504f3929e2b33e6a316fa))
* **tools:** the street shot series (furniture, stops, power, transit) replace eight old tools ([0a2cbf1](https://github.com/rbenzing/SlimCityGame/commit/0a2cbf102290884e8913bae45c6a4d3a3f281c85))
* **tools:** the town shot series: the grown town, every lens, buildings rising and lots, replacing four tools ([a76eee1](https://github.com/rbenzing/SlimCityGame/commit/a76eee1f2d52972aedfb0c3e443c6f01e951bce0))
* **tools:** the views shot series (underground, night, ghosts, panels) replace six old tools ([21b5e9c](https://github.com/rbenzing/SlimCityGame/commit/21b5e9c944f959d2d07f489e6c706bb197e30c45))


### Bug Fixes

* **shots:** one-frame subjects flow five to a row on a contact sheet ([b278b02](https://github.com/rbenzing/SlimCityGame/commit/b278b024529d35986493b6b70f1a7b30579f2d84))
* **tools:** the shot runner counts frames for street, views and town series ([b4581c9](https://github.com/rbenzing/SlimCityGame/commit/b4581c9220b443c861e58f00c4567b2ecf2d18c8))
* **tools:** the street power series becomes supply, series names must be unique ([5508e28](https://github.com/rbenzing/SlimCityGame/commit/5508e2847a60b767d851b6d8cd341fc745d29464))

## [1.101.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.100.0...slimcity-v1.101.0) (2026-11-20)


### Features

* **tools:** contact sheets, drawn tops, airport parts and a runner that holds its budgets ([5c13bb1](https://github.com/rbenzing/SlimCityGame/commit/5c13bb1ca2d58cb9d6dfb99b61fdd24362fe10dd))


### Bug Fixes

* **render:** a works' yard fence and gate are drawn from both sides ([c1b4385](https://github.com/rbenzing/SlimCityGame/commit/c1b438516de7d786f6881ef3328e3dbb83cd0084))

## [1.100.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.99.0...slimcity-v1.100.0) (2026-11-20)


### Features

* **tools:** the shot series library, its runner and the civic/health pilot ([a04f3c3](https://github.com/rbenzing/SlimCityGame/commit/a04f3c3d3304e8ecce4ab7d1eeb1d7b06614e5ff))

## [1.99.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.98.0...slimcity-v1.99.0) (2026-11-20)


### Features

* **sim:** homes are held to housing room; a demand bar reads full a tenth short ([6a88b26](https://github.com/rbenzing/SlimCityGame/commit/6a88b26e09e4a281f0be451ba77ab9ddaad2f957))

## [1.98.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.97.1...slimcity-v1.98.0) (2026-11-20)


### Features

* **render:** a low-density home's garden runs back over its yard ([2ce6e6c](https://github.com/rbenzing/SlimCityGame/commit/2ce6e6c7cfe18a57590351f5fe3fcdb30d87e803))
* **render:** homes are laid again when their yard moves; yard shots show a 7 by 7 block ([927c711](https://github.com/rbenzing/SlimCityGame/commit/927c7119d37409817c8a573ed7153c24edb97b84))
* **sim:** a mixed block's jobs are held to commerce room at spawn ([8b05ee6](https://github.com/rbenzing/SlimCityGame/commit/8b05ee6d95182b5d4ee7634a8046ded3f2b764ea))
* **sim:** a school and a police station in reach each add a point of gain to land value ([46cb5e5](https://github.com/rbenzing/SlimCityGame/commit/46cb5e570149a17701e51c37e60ca76e3bdaca5f))
* **sim:** one small level-up a pass in each sector goes ahead past the job room ([2b456c1](https://github.com/rbenzing/SlimCityGame/commit/2b456c11f9696883e20da6f664781768f6b84474))
* **world:** a yard is the zoned ground no parcel of the plat covers, and plain ground ([cd4a1a6](https://github.com/rbenzing/SlimCityGame/commit/cd4a1a632e9df718045c7e8968bbf50693aa72e1))
* **world:** the yard behind a low-density lot, derived from the zone, roads and buildings ([b35e98c](https://github.com/rbenzing/SlimCityGame/commit/b35e98c3c590beee416e5650b84248bd30d0f639))


### Bug Fixes

* **render:** the zone lens lays its tint and parcel outlines again when the ground is graded ([53cb107](https://github.com/rbenzing/SlimCityGame/commit/53cb1071641db149ec19b1a1a17a7bf595353355))
* **sim:** a level-up and a conversion read land value at the lot's street row on every side of the street ([eeb6003](https://github.com/rbenzing/SlimCityGame/commit/eeb600358ce388771cbc708fa37b3f6c5a14c142))
* **sim:** drop a redundant sector test the type check rejects ([71d0b59](https://github.com/rbenzing/SlimCityGame/commit/71d0b59fa79e003d8b4dea911133acbacea82695))
* **sim:** only commerce takes the level-up allowance; a mixed block's shopfronts are held to commerce room ([765db97](https://github.com/rbenzing/SlimCityGame/commit/765db97bcedf5e654eb73ba1c47b71a380a51716))

## [1.97.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.97.0...slimcity-v1.97.1) (2026-11-19)


### Bug Fixes

* **sim:** judge a building's road from its whole footprint ([71c8c45](https://github.com/rbenzing/SlimCityGame/commit/71c8c455e465590453d1e056254132ed50d0fce8))

## [1.97.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.96.1...slimcity-v1.97.0) (2026-11-19)


### Features

* **render:** a building site is furnished with a cabin, skip, toilet and spoil heap ([d77cf0f](https://github.com/rbenzing/SlimCityGame/commit/d77cf0f0d193ce5c4fae8aeac14c10c86cff900c))
* **render:** rooms wrap the end walls of the hospital's nursing floors at the 4 m pitch ([23e2f13](https://github.com/rbenzing/SlimCityGame/commit/23e2f13494debacf2ee27dc15aed1d19818dc167))
* **render:** site guardrails, wall openings and a hoist ([257c757](https://github.com/rbenzing/SlimCityGame/commit/257c757195f70b4aaa7aad2a155b031de4a56613))
* **render:** the hospital's four faces differ: treatment base, patient-room windows, stair towers, a service face ([e50de37](https://github.com/rbenzing/SlimCityGame/commit/e50de37842b76d289333b0b893d4abca6beaac98))


### Bug Fixes

* **render:** no door on the hospital's rear or end walls, no window behind the red-cross panel ([a6a2fc6](https://github.com/rbenzing/SlimCityGame/commit/a6a2fc6c6f10c449f66a23ff31c5f0449fb9a87f))

## [1.96.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.96.0...slimcity-v1.96.1) (2026-11-19)


### Bug Fixes

* **render:** type the modern roof plant parts ([df6bc24](https://github.com/rbenzing/SlimCityGame/commit/df6bc24e7316f0fbf6501d5f2fc3a24d64c529f8))

## [1.96.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.95.0...slimcity-v1.96.0) (2026-11-19)


### Features

* **render:** a built-in form shows its garage: portal, ramp, and a garage band where cars stand above ground ([734fef8](https://github.com/rbenzing/SlimCityGame/commit/734fef8163bbd8aa2277617493977de4e42726ae))
* **sim:** a standing building that cannot spread is rebuilt taller on its lot ([3a8d9eb](https://github.com/rbenzing/SlimCityGame/commit/3a8d9eb9b5d53dd880c00f333da257288ca4ee48))
* **world:** a built-in form gets a real lot: walk, lawn, one drive to its garage portal ([296f9f9](https://github.com/rbenzing/SlimCityGame/commit/296f9f954cb2c869c1b9b0169b691805f63977d8))
* **world:** built-in forms of the stacking kinds, with their parking built in ([b331933](https://github.com/rbenzing/SlimCityGame/commit/b3319334a790c66c94fbb646bad8cd943db041fd))
* **world:** skip built-in forms that are more garage than building ([bc96d74](https://github.com/rbenzing/SlimCityGame/commit/bc96d74169669cd6d4f27cc910a31e320e8d007a))


### Bug Fixes

* **render:** a built-in form's portal stands at grade, full 6.1 m by 2.5 m, with no ramp drawn outside ([375d163](https://github.com/rbenzing/SlimCityGame/commit/375d163380ca3c8927c5556d068cd3c7cd0ef872))
* **render:** a built-in shop or restaurant is one straight-walled body, one window row a storey ([ae46c95](https://github.com/rbenzing/SlimCityGame/commit/ae46c95fc3dcab536c69eae40c06607850dfa696))
* **render:** a built-in shop's sign band stays on the ground floor, clear of the first upper windows ([aed8e31](https://github.com/rbenzing/SlimCityGame/commit/aed8e31fad43d08123a5b8fde282f4d6db391ddf))
* **render:** a restaurant's dark end wall stands on each tier's own wall, not as one slab clear of a stepped body ([d712f40](https://github.com/rbenzing/SlimCityGame/commit/d712f40e695a3dec710598bff1298961110a5057))
* **render:** built-in forms keep inside their lot line and their side walls keep their windows ([7f363f5](https://github.com/rbenzing/SlimCityGame/commit/7f363f5eac6922f8938897e19169c78277f3f336))

## [1.95.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.94.0...slimcity-v1.95.0) (2026-11-19)


### Features

* **sim:** an abandoned building stands at least 10 passes before demand may clear it ([6f440f9](https://github.com/rbenzing/SlimCityGame/commit/6f440f9952378e0f6b2f3892000d32bd2e7ab19b))
* **sim:** an abandoned building stands until its zone's demand is high, then is cleared ([1c63383](https://github.com/rbenzing/SlimCityGame/commit/1c6338394ed7a47d79035373bf2b4436ffd4c7e7))
* **sim:** no zoned building grows taller than its town's size allows ([8f91c94](https://github.com/rbenzing/SlimCityGame/commit/8f91c941bc9d1a4d1979327bb8dbe04050d3089a))

## [1.94.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.93.0...slimcity-v1.94.0) (2026-11-19)


### Features

* **data:** the car wash, three levels, with its parking, lane and court ([6604c87](https://github.com/rbenzing/SlimCityGame/commit/6604c877efbec9896ec714f5c84ecfec19e7507c))
* **render:** the car wash kit: open portals under sign bands, a pay kiosk, a vacuum canopy on posts ([28890cd](https://github.com/rbenzing/SlimCityGame/commit/28890cd9836edf7a8fcee62c6e707c6eb2c7e23d))
* **sim:** lots stay roomy until Grand City ([ed8dfb9](https://github.com/rbenzing/SlimCityGame/commit/ed8dfb90f0f8dd54260708204d08c26a66136f47))


### Bug Fixes

* **data:** a car wash lays no walk to its portals ([f227a0a](https://github.com/rbenzing/SlimCityGame/commit/f227a0a9e6b035388b54f536f4fdcd36d7113296))

## [1.93.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.92.0...slimcity-v1.93.0) (2026-11-19)


### Features

* **data:** a roomy lot for every shop and works kind, appended to the catalog ([1603514](https://github.com/rbenzing/SlimCityGame/commit/16035141e908bbb06515a375f77b7fc9ae316eae))
* **shared:** a roomy lot keeps a planted strip inside every lot line ([dd70f6d](https://github.com/rbenzing/SlimCityGame/commit/dd70f6ddeede20ff53b67a8dcf0dce2aeacbae84))
* **sim:** below Small City a shop or works grows on the roomiest lot of its kind ([ba44570](https://github.com/rbenzing/SlimCityGame/commit/ba4457092e34ea1c258d58ddbb71a45344ff1ada))


### Bug Fixes

* **sim:** turn an unplatted shop or works to put its long side on its street; keep berths off the aisles of a larger lot ([1b391b7](https://github.com/rbenzing/SlimCityGame/commit/1b391b746c003f89ade6e6cfdb0deea510f70233))

## [1.92.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.91.1...slimcity-v1.92.0) (2026-11-18)


### Features

* **render:** a walk through an island, a chain-link fence, the island tree, the kit's own furniture kept clear ([cf50f13](https://github.com/rbenzing/SlimCityGame/commit/cf50f13eed4b61645cc5490187e308437ae3212d))
* **render:** carry a shop's walk across the verge to the footway ([041ca50](https://github.com/rbenzing/SlimCityGame/commit/041ca50021ea35dfc213ffbe27056dae3ad73e58))
* **render:** draw each shop and works lot's grounds from instanced pools ([50ca2bc](https://github.com/rbenzing/SlimCityGame/commit/50ca2bc99abcf53ebb532f0ab2c2a04ea05157b5))
* **shared:** one grounds plan for every commercial and industrial lot ([a87ecd8](https://github.com/rbenzing/SlimCityGame/commit/a87ecd8dd088e1e9cc4b327553a70d1cd0d9f568))

## [1.91.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.91.0...slimcity-v1.91.1) (2026-11-18)


### Bug Fixes

* **render:** bus stop pad on an unkerbed road adjoins the roadway ([c941a22](https://github.com/rbenzing/SlimCityGame/commit/c941a22f04c7360d1fe4dc0a1c92b485e3b8df87))
* **render:** fences stop at roofs, mansard sign lies on its slope, garden stair guards ([f722b3c](https://github.com/rbenzing/SlimCityGame/commit/f722b3c6cc2ef50a6f46bdcd044beaba75c09e93))
* **render:** gravel joint, one-way yellow and bike lane ends ([46e444a](https://github.com/rbenzing/SlimCityGame/commit/46e444aac310194d1ee419f6daa8617c2c204b7a))
* **render:** keep every street wire inside its tile and 2.3 m from a wall ([4078576](https://github.com/rbenzing/SlimCityGame/commit/4078576ebe9bbf50ec18f626e94ad1500113744b))
* **render:** keep wild trees and shrubs off the landfill fill and its office ([cdc8161](https://github.com/rbenzing/SlimCityGame/commit/cdc81616fc352c5793561f61d10f1f74c8daa2a8))
* **render:** night tint on street furniture and landfill; no median trees on decks or narrow medians ([7c745a3](https://github.com/rbenzing/SlimCityGame/commit/7c745a3a35a2d435acb01d80b959d0cc54f8b33c))
* **render:** one arrow set per one-way approach tile, motorway cap edge lines, grid bend dash phase ([62cc262](https://github.com/rbenzing/SlimCityGame/commit/62cc26231cdfb692d8340198d197869344677d08))
* **render:** one unbroken buried cable to its riser foot; source-end pole guy clear of the fence ([532f50d](https://github.com/rbenzing/SlimCityGame/commit/532f50df25572c6345b2ae58cf96ceef380cfc26))
* **render:** open stair on the footway for raised tram stations ([4a8ee88](https://github.com/rbenzing/SlimCityGame/commit/4a8ee88a93ce87a51d17870b0accf074ba914aab))
* **tools:** give the long shot tools the timeout their duration needs ([8d5d6ad](https://github.com/rbenzing/SlimCityGame/commit/8d5d6ad14cdf34e0268b2fbc767c8c206980319a))

## [1.91.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.90.0...slimcity-v1.91.0) (2026-11-18)


### Features

* **tools:** a shot runner that runs every shot tool in parallel shards ([bffafb5](https://github.com/rbenzing/SlimCityGame/commit/bffafb59803ab15c1bf81c00f3355bf726813446))


### Performance Improvements

* **tools:** shot tools wait on conditions and stop shipping the whole grid ([6767367](https://github.com/rbenzing/SlimCityGame/commit/6767367233e97ac0b67e2b7a5d10655b31cea62c))
* **tools:** tramway waits on the tram's reported position, not on screenshot differences ([f631384](https://github.com/rbenzing/SlimCityGame/commit/f6313840b7e2c957a5da3cd8e79aeca638bac950))

## [1.90.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.89.0...slimcity-v1.90.0) (2026-11-18)


### Features

* **airports:** fence, tower, fuel, hangars, cargo, garages and a loop road ([459de12](https://github.com/rbenzing/SlimCityGame/commit/459de123240a70a8b5ca0a05c82c870f4970d7e9))


### Bug Fixes

* **render:** round a lot's car park corners and island ends ([8242447](https://github.com/rbenzing/SlimCityGame/commit/8242447dfc102b50568a08920d5425b96b0fc6bc))
* **roads:** turn a kerbless road's bends and corners on an arc ([077e142](https://github.com/rbenzing/SlimCityGame/commit/077e1422627ac7f9ebcaca83f272f011513c65b3))

## [1.89.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.88.3...slimcity-v1.89.0) (2026-11-18)


### Features

* **airports:** draw the three airports from their layout, painted to the marking circular ([4fda141](https://github.com/rbenzing/SlimCityGame/commit/4fda14154c9e6c60ab2e1be659a552cd8eec3b7f))
* **airports:** three airports' layout, catalog entries and placement ([c1304b4](https://github.com/rbenzing/SlimCityGame/commit/c1304b42d32d748a7a0276bf991959722b9fba8b))


### Bug Fixes

* **render:** a part thinner than one shadow texel casts no shadow ([769ce87](https://github.com/rbenzing/SlimCityGame/commit/769ce87fc79509ef6f4434af2c6cd93af40a6a1b))
* **roads:** a kerb face under every footway edge, and lane symbols and tram track on free roads ([07c70e9](https://github.com/rbenzing/SlimCityGame/commit/07c70e94653ed2e5aca6a86955aba5733884b91c))

## [1.88.3](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.88.2...slimcity-v1.88.3) (2026-11-17)


### Bug Fixes

* **render:** a landfill mound, a stand, a shelter, a garage roof and leads to the house ([bad715f](https://github.com/rbenzing/SlimCityGame/commit/bad715f87b7be74bbc062c5b3d01ff9639430731))
* **render:** light the hospital, tint stall paint at night, lift the lamp pool over the median ([4445fcd](https://github.com/rbenzing/SlimCityGame/commit/4445fcdd47f0386c6d67ad9b6670fa677cb06ccd))
* **render:** pave a heavy plant's yard, and stand the recovery stack at its spec's 90 m ([3a9b326](https://github.com/rbenzing/SlimCityGame/commit/3a9b3269c87af7e900fe342622951dbffd7f9e4d))
* **roads:** a bend is a no-passing zone, the gore keeps its lane, caps carry only an edge line ([c66f373](https://github.com/rbenzing/SlimCityGame/commit/c66f3730f6728cebb60c944b7430e928ae6a0552))

## [1.88.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.88.1...slimcity-v1.88.2) (2026-11-17)


### Bug Fixes

* **render:** a farm's drive meets its road, a reactor's intake reaches the water, a drain's pad fits its structure ([2e457fb](https://github.com/rbenzing/SlimCityGame/commit/2e457fba5f12b0f237f3461a4e5242d3f271fb0f))
* **render:** a walk-up's stair reaches its top floor, a walk reaches its door, and a lit pane is one window ([f201453](https://github.com/rbenzing/SlimCityGame/commit/f2014537eb3bd985e953c977d7917b7411b0cb96))
* **roads:** an exit's neutral area is painted, and a climbing deck leaves its junction without a step ([1175e16](https://github.com/rbenzing/SlimCityGame/commit/1175e168366a60826ed1fd40e7c12db68c2e34b7))

## [1.88.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.88.0...slimcity-v1.88.1) (2026-11-15)


### Bug Fixes

* **lots:** a shop keeps a 36 in walk between its stall heads and its wall ([1fc5702](https://github.com/rbenzing/SlimCityGame/commit/1fc570240e5a9c5033ca404b88fb9095b5b96f70))
* **render:** a bridge's structure hangs from the deck's own edges and follows the ground ([0223002](https://github.com/rbenzing/SlimCityGame/commit/02230028ef6985b6ee706b751099d0078b2ed52c))
* **render:** a chemical plant's flare stands on its tank farm, piped to a tank ([03cbcbb](https://github.com/rbenzing/SlimCityGame/commit/03cbcbb36df434c40b6399e95551bbd5b1335d2a))
* **render:** a home's parking keeps clear of its entry, and a walker reaches the door by the front walk ([9e4d07a](https://github.com/rbenzing/SlimCityGame/commit/9e4d07a7c139960ece5c1f4ac94dca7dc5e8e972))
* **render:** a one-storey lobby with doors and a walk, a mixed-use shopfront, and a deck clear of its building ([b149a76](https://github.com/rbenzing/SlimCityGame/commit/b149a7698047b8fe0555e6704731c3cf4a249fe1))
* **render:** a power pole keeps 1.5 m from a bus stop's sign post ([ea7066a](https://github.com/rbenzing/SlimCityGame/commit/ea7066a10d7f0d9e57e70c743e1bea49f646195b))
* **render:** a power wire keeps 1.83 m from every lamp and signal, and a lamp too near hangs on the pole ([f4cc2ca](https://github.com/rbenzing/SlimCityGame/commit/f4cc2cada0f1f67fb6e058810c7ee7eed8f3df4f))
* **render:** a raised station's stair and lift stand on the ground and land on the footway ([a6cf87c](https://github.com/rbenzing/SlimCityGame/commit/a6cf87cac78c7412341aa2e846b94f4f80b8e166))
* **render:** a road's ghost shows the parts of the road it previews ([fd7fdb2](https://github.com/rbenzing/SlimCityGame/commit/fd7fdb2e2dffaf3a79af6e023c2a549c594c6792))
* **render:** a tramway carries its wire, and depot poles stand clear of the trams ([34f1212](https://github.com/rbenzing/SlimCityGame/commit/34f1212687cc7b224dbb08e975efc5e75739fb80))
* **roads:** a corridor's island, its yellow and its far kerb bend across seams, and shoulder hatching takes its edge line's colour ([ab3c96e](https://github.com/rbenzing/SlimCityGame/commit/ab3c96e279391ede069764ed22d6e21a9af4cda9))
* **roads:** a corridor's turn bay, median island and crossing follow its lanes ([11bb88f](https://github.com/rbenzing/SlimCityGame/commit/11bb88feb9de3e16bce6b69c97e108ae4c03c2a7))
* **roads:** a roundabout gets crosswalks, raised splitters, edge lines and lamps ([de612bf](https://github.com/rbenzing/SlimCityGame/commit/de612bfee5ba9720b81ef6647712d3ff665343ee))
* **roads:** lines that run on: flow arrows in their lanes, dashes through a bend, no stubs or slivers ([527b008](https://github.com/rbenzing/SlimCityGame/commit/527b00824c9d1455a755495310c959220134897b))
* **ui:** a lens is coloured by what its value means ([afcc416](https://github.com/rbenzing/SlimCityGame/commit/afcc416b0a4b4ae0e7007ba8880ca5188f9b8953))

## [1.88.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.87.0...slimcity-v1.88.0) (2026-11-14)


### Features

* **roads:** dead ends keep drives off their cap, and a Cul-de-sac tool lets homes form round an end ([3e8c1e8](https://github.com/rbenzing/SlimCityGame/commit/3e8c1e84b47f3ddfaf4e224a1ce9182b7f36e9fa))


### Bug Fixes

* **render:** civic kits read as what they are: a lodge, a porch, emergency doors ([cef2f42](https://github.com/rbenzing/SlimCityGame/commit/cef2f427c3174fbf82231f620cf97d849b374308))
* **roads:** an alley is an access, a gravel road a leg without paint, and no crossing lies over a ramp ([4c928b4](https://github.com/rbenzing/SlimCityGame/commit/4c928b447884bde885b9998bec7bebb41b9a6a97))
* **roads:** bus and bike lanes keep their colour round bends, dead ends and junctions ([d8a2b96](https://github.com/rbenzing/SlimCityGame/commit/d8a2b961a9f250d0e4fe4711ead08b3a5facba14))
* **roads:** track runs unbroken through bends, junctions and yard leads ([d78723a](https://github.com/rbenzing/SlimCityGame/commit/d78723a18eefccf5ba13e28635fcebc90cf75c62))

## [1.87.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.86.1...slimcity-v1.87.0) (2026-11-13)


### Features

* **render:** a building site shows what is going up and how far it has got ([641e84b](https://github.com/rbenzing/SlimCityGame/commit/641e84b3bc4f42f8cf5c6c6010e92b8898629b7f))
* **render:** a building site shows what is going up and how far it has got ([77ef912](https://github.com/rbenzing/SlimCityGame/commit/77ef91247c4d8b1131744f69f2d35be34c2aded2))


### Bug Fixes

* **render:** bus stop sign plate and set-back, depot fences, and the station's canopy and ramp ([5521588](https://github.com/rbenzing/SlimCityGame/commit/55215885f982bd02fc2a4b81dfafe316b2077016))
* **render:** bus stop sign plate and set-back, depot fences, and the station's canopy and ramp ([35bafb6](https://github.com/rbenzing/SlimCityGame/commit/35bafb6b248be000fec057e3ca37fb5417f2f6e4))
* **render:** one palette number is one colour, so roofs and fences stop reading black ([dace388](https://github.com/rbenzing/SlimCityGame/commit/dace388f51ac32d71f5ebd29dac515f8acf2b747))
* **render:** one palette number is one colour, so roofs and fences stop reading black ([da5b859](https://github.com/rbenzing/SlimCityGame/commit/da5b85903ea85dab7a7282c0f267bf919cd40977))
* **render:** park kits read as real parks ([6f0c6ac](https://github.com/rbenzing/SlimCityGame/commit/6f0c6aca762dd87bdb78a8f3cfbe1b51e7efe747))
* **render:** park kits read as real parks ([1e3d489](https://github.com/rbenzing/SlimCityGame/commit/1e3d489a6c652537925ef75c42a032b8fd5e5e20))
* **render:** service vehicles read by shape, and call pins stand over the building ([ec7be6e](https://github.com/rbenzing/SlimCityGame/commit/ec7be6e3035bf17acd7cf57a9fbeec9c77d98ef5))
* **render:** service vehicles read by shape, and call pins stand over the building ([47b096a](https://github.com/rbenzing/SlimCityGame/commit/47b096a95020117d808e36a1fa8a33da644c0af4))
* **roads:** a raised median is one kerbed island with a nose at each end ([1d7f998](https://github.com/rbenzing/SlimCityGame/commit/1d7f9986c31f8f029eaec3e2ddb5ded71d5603cf))
* **roads:** a raised median is one kerbed island with a nose at each end ([995b54b](https://github.com/rbenzing/SlimCityGame/commit/995b54b6a752d6d814d3ccaa24f025cfe48bbe28))
* **roads:** crosswalks stand outside the box, and a divided road is one intersection ([611049e](https://github.com/rbenzing/SlimCityGame/commit/611049ebec0ce91acdb35f0c5f34169b1a69315f))
* **roads:** parking lanes are marked round driveways, with corner marks and whole stalls ([be58b97](https://github.com/rbenzing/SlimCityGame/commit/be58b97546d471bcb2318bdf627fe3104a2a83c9))
* **roads:** parking lanes are marked round driveways, with corner marks and whole stalls ([89ba117](https://github.com/rbenzing/SlimCityGame/commit/89ba117f870ab2b22865fa1f750bcee386dc95f0))
* **ui:** lens legends, a readable stats chart, panels that fit, and a HUD that holds at 360 px ([9fec451](https://github.com/rbenzing/SlimCityGame/commit/9fec45115b4894e271e3e6e6b53c9bdf4b6baecf))
* **ui:** lens legends, a readable stats chart, panels that fit, and a HUD that holds at 360 px ([8e87dd4](https://github.com/rbenzing/SlimCityGame/commit/8e87dd4648a1edf605677e71c84f037170c298d2))

## [1.86.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.86.0...slimcity-v1.86.1) (2026-11-13)


### Bug Fixes

* **ui:** panels state what the sim knows, and refusals say why ([b7fe450](https://github.com/rbenzing/SlimCityGame/commit/b7fe45079c6460291a226ffa9db6509c8ca2e25f))
* **ui:** panels state what the sim knows, and refusals say why ([fa2f7b0](https://github.com/rbenzing/SlimCityGame/commit/fa2f7b013906c497690b7d23170f9c8310e47b07))

## [1.86.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.85.0...slimcity-v1.86.0) (2026-11-13)


### Features

* **ui:** every view shows its way out ([29517b7](https://github.com/rbenzing/SlimCityGame/commit/29517b7d321c85a0be482b45a2480bf32a1e4b3d))
* **ui:** every view shows its way out ([c444e15](https://github.com/rbenzing/SlimCityGame/commit/c444e157a25ca3d095b880e5323777b49f1a53d7))


### Bug Fixes

* **sim:** undoing an edit puts the funds back exactly ([8614439](https://github.com/rbenzing/SlimCityGame/commit/8614439c078709919b4e24bae146c72276e9ab0e))
* **sim:** undoing an edit puts the funds back exactly ([7c4bf41](https://github.com/rbenzing/SlimCityGame/commit/7c4bf41669d23f7ab6fcc1aedb6eaf4b7b9b9a5c))
* **transit:** a line's vehicles follow its route ([77e7b2e](https://github.com/rbenzing/SlimCityGame/commit/77e7b2e005945add6b2735bf949928fea804bcd1))
* **transit:** a line's vehicles follow its route ([3fc7c10](https://github.com/rbenzing/SlimCityGame/commit/3fc7c10f4d7805b777870e62910541ac8addfc75))

## [1.85.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.84.0...slimcity-v1.85.0) (2026-11-13)


### Features

* **transit:** buses, trams and trains show in every view ([25e4657](https://github.com/rbenzing/SlimCityGame/commit/25e46578b6e7c02e52648c658b6c981e4f0f74b5))
* **transit:** buses, trams and trains show in every view ([31af0a0](https://github.com/rbenzing/SlimCityGame/commit/31af0a0d8df793c19e06c5705ed49d2d2853b49d))

## [1.84.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.83.0...slimcity-v1.84.0) (2026-11-11)


### Features

* **growth:** a level-1 dense building stands in a car park ([bdc7132](https://github.com/rbenzing/SlimCityGame/commit/bdc71329cca9d5e4e0ad2dbd99900fed24dc46f9))
* **growth:** a level-1 dense building stands in a car park ([ec3849e](https://github.com/rbenzing/SlimCityGame/commit/ec3849e49da2579d3689926f42635b7a10f80688))
* **power:** a line starts at a source, and the substation ([b8234f1](https://github.com/rbenzing/SlimCityGame/commit/b8234f199269bc3d147bb0f4d70560c3d7c5f39d))
* **power:** a line starts at a source, and the substation ([6fc9ad5](https://github.com/rbenzing/SlimCityGame/commit/6fc9ad551a05e5542c0e49ae6997016c74833ccc))
* **power:** the buried cable ([9bfbdf6](https://github.com/rbenzing/SlimCityGame/commit/9bfbdf64bd1d41a63cfbfdfa6723ab2fb39e8d4d))
* **power:** the buried cable ([2a644be](https://github.com/rbenzing/SlimCityGame/commit/2a644be8ad367e4c62c7e6180f32ea4f6171e986))
* **render:** every roadside object in its place ([8ddb0d9](https://github.com/rbenzing/SlimCityGame/commit/8ddb0d966fbb08298c003d110732cb7cbfda8b3e))
* **render:** every roadside object in its place ([92a230d](https://github.com/rbenzing/SlimCityGame/commit/92a230d7c198d0904bed81f51a8a94d1d43e2d8b))


### Bug Fixes

* **world:** a grown lot levels the ring round it, and three smaller loose ends ([fffe2d6](https://github.com/rbenzing/SlimCityGame/commit/fffe2d6b29e82b033f395eaf1b0fecfb9e31f5bd))
* **world:** a grown lot levels the ring round it, and three smaller loose ends ([0d09ac2](https://github.com/rbenzing/SlimCityGame/commit/0d09ac28bfea11010b326d160369f0f370f7d45f))

## [1.83.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.82.0...slimcity-v1.83.0) (2026-11-11)


### Features

* **render:** a dense building parks in a garage on its own lot ([1b35332](https://github.com/rbenzing/SlimCityGame/commit/1b35332c07fe630f27035baa00e34286e66aef56))

## [1.82.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.81.0...slimcity-v1.82.0) (2026-11-11)


### Features

* **render:** a lamp stands at the kerb, by the street's width ([90d3a17](https://github.com/rbenzing/SlimCityGame/commit/90d3a174cfa89bd35d2d5249fe0db17e6cf04a68))

## [1.81.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.80.3...slimcity-v1.81.0) (2026-11-11)


### Features

* **power:** a street shows its supply, and a strung line leaves the carriageway ([54a81f2](https://github.com/rbenzing/SlimCityGame/commit/54a81f2a6ed6c7508d59591beddaffb3b52d51fd))
* **power:** a street shows its supply, and a strung line leaves the carriageway ([51c24e2](https://github.com/rbenzing/SlimCityGame/commit/51c24e27538c78c8c5292a609eec6206df6025df))
* **render:** a train is a train and a tram a tram ([c030b3d](https://github.com/rbenzing/SlimCityGame/commit/c030b3d75e257b23dc66782ca3fec69e36a12f74))
* **render:** a yard and a depot join their line; a platform stands at its track ([da90127](https://github.com/rbenzing/SlimCityGame/commit/da9012779fdfcec6cd3482ba0ba8d18939b03e70))
* **render:** a yard and a depot join their line; a platform stands at its track ([28bc8d8](https://github.com/rbenzing/SlimCityGame/commit/28bc8d81dd78fc2cf395048a87b92ac7fe07d2e4))
* **world:** a building faces its street ([2aa5369](https://github.com/rbenzing/SlimCityGame/commit/2aa5369dd8d1e2254e16cb5c4452e06581dfc840))
* **world:** a placed building stands beside a street, and a refusal says why ([9b7e55d](https://github.com/rbenzing/SlimCityGame/commit/9b7e55df239099f01ccd6501514e79bcd05e224d))


### Bug Fixes

* **render:** a farm silo is a whole cylinder ([de3edda](https://github.com/rbenzing/SlimCityGame/commit/de3edda18525f76f3d33dc0da20460f2a5a7d908))
* **render:** a fence keeps to its own lot's line ([702f83f](https://github.com/rbenzing/SlimCityGame/commit/702f83fd974634db4fe067aa69ad38b45c512274))
* **render:** a plot lies flush with its ground and its street ([d674952](https://github.com/rbenzing/SlimCityGame/commit/d674952bcb34c7fc137d3cddc5320fe42216eee4))
* **render:** one car a stall, and a building reports the stalls it draws ([7fdc725](https://github.com/rbenzing/SlimCityGame/commit/7fdc725746d5e13d63a966c2691ad28702060f7c))
* **roads:** a bend is an arc ([d1d1dc6](https://github.com/rbenzing/SlimCityGame/commit/d1d1dc67762176483756e275f7ffd50b15dfb276))

## [1.80.3](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.80.2...slimcity-v1.80.3) (2026-11-11)


### Bug Fixes

* **render:** the page keeps answering while a city grows at 4× ([7cca2d9](https://github.com/rbenzing/SlimCityGame/commit/7cca2d98e7524debcba49efa291636b68c1c06e9))
* **render:** the page keeps answering while a city grows at 4× ([49c8245](https://github.com/rbenzing/SlimCityGame/commit/49c82453b1cee31521e9885f930e10a84a68d51b))

## [1.80.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.80.1...slimcity-v1.80.2) (2026-10-28)


### Bug Fixes

* **sim:** sandbox lifts growth's unlocks; each testing option answers its own checkbox ([7efcb24](https://github.com/rbenzing/SlimCityGame/commit/7efcb24527e6b9b3dde81a8cb05c372df0f6af5c))
* **sim:** sandbox lifts growth's unlocks; each testing option answers… ([2b20a5e](https://github.com/rbenzing/SlimCityGame/commit/2b20a5e4c0778247083c158730871d452c8596ef))

## [1.80.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.80.0...slimcity-v1.80.1) (2026-10-28)


### Bug Fixes

* **rules:** four owed rules — ghost shore check, lots re-laid on a road edit, junction step, on-scene time per kind ([e3919e0](https://github.com/rbenzing/SlimCityGame/commit/e3919e047f26372ba9d3177fb23da4e488a5bd85))
* **rules:** four owed rules — ghost shore check, lots re-laid on a road edit, junction step, on-scene time per kind ([c92f4cf](https://github.com/rbenzing/SlimCityGame/commit/c92f4cf61f208a998b0f7c85c78228892990e792))

## [1.80.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.79.0...slimcity-v1.80.0) (2026-10-28)


### Features

* **render:** every civic building has a way in to the road (civic access, slice 2) ([637bb49](https://github.com/rbenzing/SlimCityGame/commit/637bb49f8bed5ffdd74f986f53f408e7bd38a75f))
* **render:** every civic building has a way in to the road (civic access, slice 2) ([205bf4c](https://github.com/rbenzing/SlimCityGame/commit/205bf4c8880546b9bcfbbf570469dc4bf1d7a46a))


### Bug Fixes

* **transit:** a bus stop stands beyond the footway, the footway kept clear ([2e602ab](https://github.com/rbenzing/SlimCityGame/commit/2e602ab973ea60f07581a883e892c0bf1bcebfa9))

## [1.79.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.78.0...slimcity-v1.79.0) (2026-10-28)


### Features

* **transit:** a bus stop is furniture on the footway, a sign or a sh… ([16fc1b0](https://github.com/rbenzing/SlimCityGame/commit/16fc1b040a1bae5e6d4135fdaca2b199dfa59430))
* **transit:** a bus stop is furniture on the footway, a sign or a shelter ([91adc48](https://github.com/rbenzing/SlimCityGame/commit/91adc4890d23887450cf5f4ecd7ce465719f4d14))

## [1.78.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.77.0...slimcity-v1.78.0) (2026-10-27)


### Features

* **world:** every zone and its car parks stand square to a curve (curved parcels, slice 2) ([5ffbd51](https://github.com/rbenzing/SlimCityGame/commit/5ffbd51438137e99d749650d4417abdb91c243eb))

## [1.77.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.76.0...slimcity-v1.77.0) (2026-10-27)


### Features

* **world:** houses on a curved street stand square to it (curved par… ([27f62d2](https://github.com/rbenzing/SlimCityGame/commit/27f62d2e992d1becd84e0bfe8ce1d29ba831ecec))
* **world:** houses on a curved street stand square to it (curved parcels, slice 1) ([41a6833](https://github.com/rbenzing/SlimCityGame/commit/41a6833401c4bfbdac107d69996aca2414010655))

## [1.76.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.75.0...slimcity-v1.76.0) (2026-10-27)


### Features

* **render:** houses and blocks built the way the US builds them, by … ([704bc4b](https://github.com/rbenzing/SlimCityGame/commit/704bc4b7f7df85d24136121e3f59d8126eae93e3))
* **render:** houses and blocks built the way the US builds them, by share ([2d70094](https://github.com/rbenzing/SlimCityGame/commit/2d70094a05f918b81c166777c3bfd27cf56df05c))

## [1.75.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.74.1...slimcity-v1.75.0) (2026-10-26)


### Features

* **render:** the commercial kinds told apart at 40 m, from sources ([589cdb5](https://github.com/rbenzing/SlimCityGame/commit/589cdb513a08485fd6a143f3ad6e3b5546c96252))
* **render:** the commercial kinds told apart at 40 m, from sources ([9a66aca](https://github.com/rbenzing/SlimCityGame/commit/9a66acaa1b651b6a50c00f338b76957a81076459))


### Bug Fixes

* **render:** the night stays night, and a building stays legible in it ([457b1b8](https://github.com/rbenzing/SlimCityGame/commit/457b1b8e528a24eabcf5f642c959d8f5de44987a))
* **render:** the night stays night, and a building stays legible in it ([9047de7](https://github.com/rbenzing/SlimCityGame/commit/9047de7a9f50cd956a6ae42e4b5b63cb24dd0c42))

## [1.74.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.74.0...slimcity-v1.74.1) (2026-10-23)


### Bug Fixes

* **render:** seven debts the last epics logged, paid ([53645ee](https://github.com/rbenzing/SlimCityGame/commit/53645ee640565a2efdb966a0ce9757b5072ee279))
* **render:** seven debts the last epics logged, paid ([1429e23](https://github.com/rbenzing/SlimCityGame/commit/1429e234477860e239a5fa83666cae72536d2f92))

## [1.74.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.73.0...slimcity-v1.74.0) (2026-10-23)


### Features

* **render:** the five park rungs drawn at their real sizes, and worn by their load ([d1a83a7](https://github.com/rbenzing/SlimCityGame/commit/d1a83a7dd6b68787760f26a8b8e22c8650e79d19))

## [1.73.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.72.0...slimcity-v1.73.0) (2026-10-23)


### Features

* **sim:** parks at real sizes, planned to a provision standard ([f4562cb](https://github.com/rbenzing/SlimCityGame/commit/f4562cbc336fe4e7cda654b24eb16e8f47bdc028))

## [1.72.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.71.0...slimcity-v1.72.0) (2026-10-23)


### Features

* **render:** the raised stations, and tramways complete ([fff14ff](https://github.com/rbenzing/SlimCityGame/commit/fff14ffa23959b005a972fd719d497345c2a0115))
* **render:** the raised stations, and tramways complete ([ef2cf65](https://github.com/rbenzing/SlimCityGame/commit/ef2cf65ea276339cadf00d224a6456348fd4c1c9))

## [1.71.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.70.2...slimcity-v1.71.0) (2026-10-23)


### Features

* **render:** a tram reservation lifted onto an elevated guideway ([eeb73f0](https://github.com/rbenzing/SlimCityGame/commit/eeb73f014bb0abe4c0622317931ce3dde95a3023))
* **render:** a tram reservation lifted onto an elevated guideway ([24edbe4](https://github.com/rbenzing/SlimCityGame/commit/24edbe4ba8b57aa3af7ac8b127c7db8206a6e75b))

## [1.70.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.70.1...slimcity-v1.70.2) (2026-10-21)


### Bug Fixes

* **roads:** the ground stays under every road, a ramp bends itself, and a T's far side keeps the arms' width ([ac9ad17](https://github.com/rbenzing/SlimCityGame/commit/ac9ad17e1d7b044530f3a28bf4392492adac5b6a))
* **roads:** the ground stays under every road, a ramp bends itself, and a T's far side keeps the arms' width ([ff006c8](https://github.com/rbenzing/SlimCityGame/commit/ff006c8825356e8e754fc68da6911bf0e5bb16e0))

## [1.70.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.70.0...slimcity-v1.70.1) (2026-10-20)


### Bug Fixes

* **roads:** a turn bay never narrows its road, and the drives beside it meet its kerb ([9e2a3ce](https://github.com/rbenzing/SlimCityGame/commit/9e2a3ce1f32aaae45adb4ae142b82dd641e04f99))
* **roads:** a turn bay never narrows its road, and the drives beside it meet its kerb ([558ad3d](https://github.com/rbenzing/SlimCityGame/commit/558ad3d1a4e29ee247d9c4d09912c530255dcbcc))

## [1.70.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.69.0...slimcity-v1.70.0) (2026-10-16)


### Features

* **render:** the street tramway drawn as a street, and every tram lane is track ([6951ad3](https://github.com/rbenzing/SlimCityGame/commit/6951ad3bf24f27fffd56d85a513c87416afc5cc3))
* **render:** the street tramway drawn as a street, and every tram lane is track ([3a74d1c](https://github.com/rbenzing/SlimCityGame/commit/3a74d1c411f6487f74898230638fc526212f6bb8))

## [1.69.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.68.0...slimcity-v1.69.0) (2026-10-16)


### Features

* **render:** the depot kits, the fleet at home parked on the apron ([14080b3](https://github.com/rbenzing/SlimCityGame/commit/14080b3d5e2d4e49f3e79a04319379cf5113ff28))
* **render:** the depot kits, the fleet at home parked on the apron ([4e71d85](https://github.com/rbenzing/SlimCityGame/commit/4e71d85de3ec5e4c86c854c8b8a608f60cf709af))

## [1.68.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.67.0...slimcity-v1.68.0) (2026-10-16)


### Features

* **sim:** transit dead runs, each line's vehicles from its nearest depot ([49b6c1e](https://github.com/rbenzing/SlimCityGame/commit/49b6c1e7e438a996bb5457a15a3ce66427036b20))
* **sim:** transit dead runs, each line's vehicles from its nearest depot ([c11d987](https://github.com/rbenzing/SlimCityGame/commit/c11d9871f89bac2cb16bd6ee6d02c9bd6c33d980))

## [1.67.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.66.0...slimcity-v1.67.0) (2026-10-16)


### Features

* **sim:** transport depots field a line's vehicles and charge what they run ([59335e7](https://github.com/rbenzing/SlimCityGame/commit/59335e7b1d3626c7136574bebba681db963be676))
* **sim:** transport depots field a line's vehicles and charge what they run ([057ce54](https://github.com/rbenzing/SlimCityGame/commit/057ce54e54c98c3d681a9e0a5c7048b0ede03311))

## [1.66.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.65.0...slimcity-v1.66.0) (2026-10-16)


### Features

* **render:** the earliest civic kits redone as the plants they are ([d59e444](https://github.com/rbenzing/SlimCityGame/commit/d59e4440c4ddb01a337b44430186cfa100d6d37f))
* **render:** the earliest civic kits redone as the plants they are ([1228d47](https://github.com/rbenzing/SlimCityGame/commit/1228d4758a7e5229d9320addec7acd97aadda027))

## [1.65.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.64.0...slimcity-v1.65.0) (2026-10-16)


### Features

* **render:** the apartment kit's parts, each block drawn as the multi-family type it is ([47fd393](https://github.com/rbenzing/SlimCityGame/commit/47fd3935d56cfd913fce314ca6d0db5dfe715f8f))
* **render:** the apartment kit's parts, each block drawn as the multi-family type it is ([af259b9](https://github.com/rbenzing/SlimCityGame/commit/af259b9dabda8d0f7bbb70b15aa5b5eb65a27e75))

## [1.64.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.63.0...slimcity-v1.64.0) (2026-10-15)


### Features

* **render:** the industrial kit's parts and the farmstead ([c654bb9](https://github.com/rbenzing/SlimCityGame/commit/c654bb90d93659563233cfd5d301a59acce6f2e9))
* **render:** the industrial kit's parts and the farmstead, each kind drawn as the plant it is ([4cb42d7](https://github.com/rbenzing/SlimCityGame/commit/4cb42d7b7f4c00f169f6b2628248600e40fbb25b))

## [1.63.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.62.0...slimcity-v1.63.0) (2026-10-15)


### Features

* **render:** the storefront kit's parts, each commercial kind read from its car park ([ac3c1b0](https://github.com/rbenzing/SlimCityGame/commit/ac3c1b01e430dffc719064b244b502e9a614341b))
* **render:** the storefront kit's parts, each commercial kind read from its car park ([d98531b](https://github.com/rbenzing/SlimCityGame/commit/d98531b3d6a6a1a0f9b7fe956996b7bd976a7f2f))

## [1.62.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.61.0...slimcity-v1.62.0) (2026-10-15)


### Features

* **render:** measure the frame, and hold every building to a triangle tier ([179bc11](https://github.com/rbenzing/SlimCityGame/commit/179bc117a6bb5bf85a66513d2dd96785edf65102))
* **render:** measure the frame, and hold every building to a triangle tier ([448a76c](https://github.com/rbenzing/SlimCityGame/commit/448a76c5d3489a01922bfba0768d6705aa005847))
* **render:** the house kit's parts, a ranch, a Cape and a colonial by level ([4d3855d](https://github.com/rbenzing/SlimCityGame/commit/4d3855d2e362009c8108895baab323ccba556c52))
* **render:** the house kit's parts, a ranch, a Cape and a colonial by level ([d167f9f](https://github.com/rbenzing/SlimCityGame/commit/d167f9f471b4352b8a202f09b658fe7631d1b2a5))


### Performance Improvements

* **render:** lots one mesh per chunk, trees and yards drawn for 40 m, the solar farm thinned ([0c8839c](https://github.com/rbenzing/SlimCityGame/commit/0c8839c3a9b93a1236407420097969cc2c0957c5))
* **render:** lots one mesh per chunk, trees and yards drawn for 40 m, the solar farm thinned ([36ac17c](https://github.com/rbenzing/SlimCityGame/commit/36ac17cb060cadfd4f53a4a3a9bcfc50bff09a87))

## [1.61.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.60.0...slimcity-v1.61.0) (2026-10-15)


### Features

* **power:** a solar farm, a gas turbine, a combined-cycle station and a reactor, each a real small unit ([51f4167](https://github.com/rbenzing/SlimCityGame/commit/51f4167634166f0c2381e20adae6d89ec0cfa8c2))
* **power:** a solar farm, a gas turbine, a combined-cycle station and a reactor, each a real small unit ([26b6892](https://github.com/rbenzing/SlimCityGame/commit/26b68924b6a9723b216c755beef838d282b19837))
* **render:** the solar farm, gas turbine, combined-cycle station and reactor drawn as plants ([07d0e51](https://github.com/rbenzing/SlimCityGame/commit/07d0e5199dab326b93ef8e2e454eff08ec573bfe))
* **render:** the solar farm, gas turbine, combined-cycle station and reactor drawn as plants ([8170d96](https://github.com/rbenzing/SlimCityGame/commit/8170d9684fdeb40c870c0017822114acafc0415a))

## [1.60.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.59.0...slimcity-v1.60.0) (2026-10-14)


### Features

* **render:** the schools, the college and the library drawn as campuses ([ac25a10](https://github.com/rbenzing/SlimCityGame/commit/ac25a101f9f0aa9dfd8744c6e0ac07c574520e42))
* **render:** the schools, the college and the library drawn as campuses ([453d21d](https://github.com/rbenzing/SlimCityGame/commit/453d21d681db78c7ed241639bcc30e58be724725))

## [1.59.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.58.0...slimcity-v1.59.0) (2026-10-14)


### Features

* **services:** a US education ladder of four schools and a library, gating level 3 ([df1cf96](https://github.com/rbenzing/SlimCityGame/commit/df1cf96b9de70b32f80ffad4840f0c91fb92ab67))
* **services:** a US education ladder of four schools and a library, gating level 3 ([d04ec3d](https://github.com/rbenzing/SlimCityGame/commit/d04ec3da748aad8b0852436060cf6f4ebd05722d))

## [1.58.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.57.0...slimcity-v1.58.0) (2026-10-14)


### Features

* **services:** district fire and police stations, and stations drawn as stations ([26ed928](https://github.com/rbenzing/SlimCityGame/commit/26ed9283c4f57575bb0dfb23dfef8d7914bda45e))
* **services:** district fire and police stations, and stations drawn as stations ([d60a7d9](https://github.com/rbenzing/SlimCityGame/commit/d60a7d986ac42d9d2f362116a513577ae7ae4f2a))

## [1.57.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.56.0...slimcity-v1.57.0) (2026-10-14)


### Features

* **services:** stations answer within road reach, while a crew is free, at real call rates ([6d0232b](https://github.com/rbenzing/SlimCityGame/commit/6d0232b9b5f931b4f421ca3ef44f2bff168516e2))
* **services:** stations answer within road reach, while a crew is free, at real call rates ([a48f0d7](https://github.com/rbenzing/SlimCityGame/commit/a48f0d72f3f35d12e8b5ee165cc48b04b1408a44))

## [1.56.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.55.0...slimcity-v1.56.0) (2026-10-14)


### Features

* **services:** the crematorium, and an exhumation charge to clear a cemetery ([d97e9de](https://github.com/rbenzing/SlimCityGame/commit/d97e9de209bcdef7ff119becbb6741ebda687c2e))
* **services:** the crematorium, and an exhumation charge to clear a cemetery ([ce3a175](https://github.com/rbenzing/SlimCityGame/commit/ce3a1759173a606eab1b3849c56c8133b2d82bf4))

## [1.55.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.54.0...slimcity-v1.55.0) (2026-10-14)


### Features

* **services:** bodies, a regional funeral service until Big Town, th… ([dd82fbc](https://github.com/rbenzing/SlimCityGame/commit/dd82fbc4f500a4f572cf911f0b537336193413ea))
* **services:** bodies, a regional funeral service until Big Town, the cemetery and the hearse ([9d07009](https://github.com/rbenzing/SlimCityGame/commit/9d070092238f8930003ef3bcf7963a637305d3bd))

## [1.54.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.53.0...slimcity-v1.54.0) (2026-10-14)


### Features

* **sim:** residents die, and the homes they empty are let again ([6c92b05](https://github.com/rbenzing/SlimCityGame/commit/6c92b05d18029c4cd54b5bdd34afbea837fd936a))
* **sim:** residents die, and the homes they empty are let again ([5fdb750](https://github.com/rbenzing/SlimCityGame/commit/5fdb750ad406dfc42442b748c28261cf4540408a))

## [1.53.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.52.0...slimcity-v1.53.0) (2026-10-09)


### Features

* **lots:** the kerb counts toward a lot's parking, and short kinds get larger lots ([4b22e78](https://github.com/rbenzing/SlimCityGame/commit/4b22e780f807d186fe5aaabfc10936313b6f24cf))
* **lots:** the kerb counts toward a lot's parking, and short kinds get larger lots ([54c983a](https://github.com/rbenzing/SlimCityGame/commit/54c983aac1b927965348bd3cec3837c7f3e2516d))

## [1.52.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.51.0...slimcity-v1.52.0) (2026-10-09)


### Features

* **lots:** suburban commercial and industrial lots drawn to parking code ([d22f2a2](https://github.com/rbenzing/SlimCityGame/commit/d22f2a205f4e52064dfb3d29a7e76dce02cde9df))
* **lots:** suburban commercial and industrial lots drawn to parking code ([3c8d50b](https://github.com/rbenzing/SlimCityGame/commit/3c8d50bf4354baadd9eab719a0accda550376975))

## [1.51.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.50.1...slimcity-v1.51.0) (2026-10-09)


### Features

* **health:** the clinic at its size, and a hospital with its parking to code ([a2bcd21](https://github.com/rbenzing/SlimCityGame/commit/a2bcd21165b5ea29061273304199df1b75547fed))
* **health:** the clinic at its size, and a hospital with its parking… ([b4960f4](https://github.com/rbenzing/SlimCityGame/commit/b4960f42ad012b9f8e0acefb64fa99f58fb478d1))

## [1.50.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.50.0...slimcity-v1.50.1) (2026-10-09)


### Bug Fixes

* **services:** the four capacities re-sourced, and feature docs say w… ([78c1515](https://github.com/rbenzing/SlimCityGame/commit/78c151576e47bf260032544e4bb4fc0ae5df1dee))
* **services:** the four capacities re-sourced, and feature docs say what shipped ([431849f](https://github.com/rbenzing/SlimCityGame/commit/431849fc5682b03a1d534b35f4d59be2f7443f00))

## [1.50.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.49.0...slimcity-v1.50.0) (2026-10-09)


### Features

* **garbage:** a transfer station lends the dump its reach ([a455ede](https://github.com/rbenzing/SlimCityGame/commit/a455edee089a61b75eb126f52f0d2e872cfe1b34))
* **garbage:** a transfer station lends the dump its reach ([898c473](https://github.com/rbenzing/SlimCityGame/commit/898c47331781a5a2d2ab0e698f414a91b302d4d8))

## [1.49.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.48.0...slimcity-v1.49.0) (2026-10-08)


### Features

* **garbage:** a materials recovery facility sorts the town's recycling ([a2017ce](https://github.com/rbenzing/SlimCityGame/commit/a2017ce0d8c322d58b4bbf70f07b430897bd71e1))
* **garbage:** a materials recovery facility sorts the town's recycling ([61dce56](https://github.com/rbenzing/SlimCityGame/commit/61dce56485b88bf7d4f1cfaf1222e31544886ff8))

## [1.48.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.47.1...slimcity-v1.48.0) (2026-10-08)


### Features

* **roads:** parking styles and accessible spaces ([87d2461](https://github.com/rbenzing/SlimCityGame/commit/87d2461564aa67b8be55bd42318321f2b58962c7))
* **roads:** parking styles and accessible spaces ([10f24c7](https://github.com/rbenzing/SlimCityGame/commit/10f24c763f7a0f84207b428b2b2a37e7fc260705))

## [1.47.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.47.0...slimcity-v1.47.1) (2026-10-08)


### Bug Fixes

* **roads:** streets keep their width to the junction, marked to the m… ([054e7ce](https://github.com/rbenzing/SlimCityGame/commit/054e7cec90fe279507921ebc2206a4cd7934d1bd))
* **roads:** streets keep their width to the junction, marked to the manual ([b6a7a42](https://github.com/rbenzing/SlimCityGame/commit/b6a7a4225b58b698e4563f25de7124538417c79a))

## [1.47.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.46.0...slimcity-v1.47.0) (2026-10-08)


### Features

* **water:** the water tower at its real size, on one tile ([b72010f](https://github.com/rbenzing/SlimCityGame/commit/b72010f1691e8400c7911ae89377dbf82d7f1444))
* **water:** the water tower at its real size, on one tile ([6ec1180](https://github.com/rbenzing/SlimCityGame/commit/6ec1180b1dafcda4e0e0527c5eca7097e7dca949))

## [1.46.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.45.0...slimcity-v1.46.0) (2026-10-08)


### Features

* **garbage:** a kerbside recycling depot takes the houses' recycling ([27f8de1](https://github.com/rbenzing/SlimCityGame/commit/27f8de1e935a718edaf5a66a90dc4ce7911e99ab))
* **garbage:** a kerbside recycling depot takes the houses' recycling ([9963466](https://github.com/rbenzing/SlimCityGame/commit/996346605113370e2b2e0ca0d6a6bd4fb6e379b3))

## [1.45.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.44.0...slimcity-v1.45.0) (2026-10-08)


### Features

* **garbage:** the garbage chain runs on one real unit ([062f6ff](https://github.com/rbenzing/SlimCityGame/commit/062f6ff9779f10a0568c93b603dc1fb18833929f))
* **garbage:** the garbage chain runs on one real unit ([0665486](https://github.com/rbenzing/SlimCityGame/commit/066548692b5764cf9de8c115850c02ae6f0c96c4))

## [1.44.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.43.0...slimcity-v1.44.0) (2026-10-08)


### Features

* **lots:** the best land is cut into acre lots where the frontage ha… ([27013c0](https://github.com/rbenzing/SlimCityGame/commit/27013c0e16f7e80200e366f665bed0721560ae1e))
* **lots:** the best land is cut into acre lots where the frontage has room ([4386973](https://github.com/rbenzing/SlimCityGame/commit/43869733bec7c13ee88a3e512ee5156fd164aa51))

## [1.43.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.42.0...slimcity-v1.43.0) (2026-10-08)


### Features

* **lots:** a small house on prime land becomes a plex ([7007054](https://github.com/rbenzing/SlimCityGame/commit/700705403f019df5fe2bf7e7e67ce0d22d15d323))
* **lots:** a small house on prime land becomes a plex ([e780a15](https://github.com/rbenzing/SlimCityGame/commit/e780a1516a75bc3d2aeef64c4e3fe62b562fa6b3))

## [1.42.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.41.0...slimcity-v1.42.0) (2026-10-08)


### Features

* **lots:** a block starts on one lot and assembles its neighbours ([d39109a](https://github.com/rbenzing/SlimCityGame/commit/d39109acf67785179e0346586b7d7cadad913e5d))
* **lots:** a block starts on one lot and assembles its neighbours ([292f629](https://github.com/rbenzing/SlimCityGame/commit/292f6295d58f1f1ed2a3db265d2633262e0f2ae1))


### Bug Fixes

* **render:** a turned building stands on its own lot ([173fa52](https://github.com/rbenzing/SlimCityGame/commit/173fa52e120969a5137e0b98635e470cd6f462ad))

## [1.41.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.40.0...slimcity-v1.41.0) (2026-10-08)


### Features

* **lots:** a dense block holds the floor it is drawn with ([0bcf59a](https://github.com/rbenzing/SlimCityGame/commit/0bcf59a2891239634e7fd208c3b8fa8400e43aef))
* **lots:** a dense block holds the floor it is drawn with ([192c59a](https://github.com/rbenzing/SlimCityGame/commit/192c59a04b7f5a5a825b172a0298a607c3f88040))

## [1.40.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.39.0...slimcity-v1.40.0) (2026-10-08)


### Features

* **lots:** a townhouse row stands on one normal lot, three homes at … ([39e0588](https://github.com/rbenzing/SlimCityGame/commit/39e0588e8f74851c08e29107eb558874da473df0))
* **lots:** a townhouse row stands on one normal lot, three homes at every level ([a7ceba9](https://github.com/rbenzing/SlimCityGame/commit/a7ceba9e90891bd22101d85db4161eee7c9f246c))
* **lots:** commercial and dense land is cut into frontage lots ([d2d837d](https://github.com/rbenzing/SlimCityGame/commit/d2d837dd8e1ebd32a0b11d4a96d6ddf456f2b218))
* **lots:** commercial and dense land is cut into frontage lots ([d9e5d1c](https://github.com/rbenzing/SlimCityGame/commit/d9e5d1cfecc13079005f8e4a1dff3b8820a32014))

## [1.39.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.38.0...slimcity-v1.39.0) (2026-10-08)


### Features

* **lots:** medium density assembles two parcels ([91e1a25](https://github.com/rbenzing/SlimCityGame/commit/91e1a25c88f4b88def64b613fb2e204878122b49))
* **lots:** medium density assembles two parcels ([bcc1ab8](https://github.com/rbenzing/SlimCityGame/commit/bcc1ab8f5dde0b2adfa93bbd60ff096299f18e25))
* **lots:** replatting holds, and the inspector names the lot ([ad6ec6b](https://github.com/rbenzing/SlimCityGame/commit/ad6ec6bb2cb881094ed9514c043d1f522c537ad7))
* **lots:** replatting holds, and the inspector names the lot ([21dc4b2](https://github.com/rbenzing/SlimCityGame/commit/21dc4b2d5490cd940d81897a7778aa02a5bd0fda))
* **lots:** the duplex and the fourplex on the plat ([cd5da38](https://github.com/rbenzing/SlimCityGame/commit/cd5da3801845b320ea0abf2548121c507715ae9a))
* **lots:** the duplex and the fourplex on the plat ([66276f8](https://github.com/rbenzing/SlimCityGame/commit/66276f8f7201d794c671e059afefec63fbbcbeb9))

## [1.38.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.37.0...slimcity-v1.38.0) (2026-10-07)


### Features

* **lots:** the plat on the zone lens ([d125f43](https://github.com/rbenzing/SlimCityGame/commit/d125f437600f5c6f6761bef21028ec59da44b578))
* **lots:** the plat on the zone lens ([aacdec1](https://github.com/rbenzing/SlimCityGame/commit/aacdec14b2daf7025cbcfcefe772da87e64f33eb))

## [1.37.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.36.0...slimcity-v1.37.0) (2026-10-07)


### Features

* **lots:** lots are cut from the street, and homes face it ([9ee33a3](https://github.com/rbenzing/SlimCityGame/commit/9ee33a36cc3c7535c369a53b47c0324755d3c7dc))
* **lots:** lots are cut from the street, and homes face it ([440294d](https://github.com/rbenzing/SlimCityGame/commit/440294deb2744485a4653f09641b95d506a79ac2))

## [1.36.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.35.1...slimcity-v1.36.0) (2026-10-07)


### Features

* **lots:** a house stands on the lot the land warrants ([6b49aad](https://github.com/rbenzing/SlimCityGame/commit/6b49aade7389dbaff8bee791be88ec4b78ee8511))
* **lots:** a house stands on the lot the land warrants ([d3f19e3](https://github.com/rbenzing/SlimCityGame/commit/d3f19e3e6273cc09256600cf59b66d7243c98db8))

## [1.35.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.35.0...slimcity-v1.35.1) (2026-10-06)


### Bug Fixes

* **lots:** lots stand on their ground ([9dc829d](https://github.com/rbenzing/SlimCityGame/commit/9dc829dc63990847e6b99ebe42cd88b1a6b85b3a))
* **lots:** lots stand on their ground ([fbc89fe](https://github.com/rbenzing/SlimCityGame/commit/fbc89feac4285c9a5220c71392d1b182d2788786))
* **pedestrians:** people walk the footway and go in by the door ([bdd4d6c](https://github.com/rbenzing/SlimCityGame/commit/bdd4d6c668fb8fef133932ab429afb132d86b908))
* **pedestrians:** people walk the footway and go in by the door ([4d25769](https://github.com/rbenzing/SlimCityGame/commit/4d2576950b0f5074ba50ea685dd6bb08b26cafe2))

## [1.35.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.34.0...slimcity-v1.35.0) (2026-10-06)


### Features

* **zoning:** a zone over a built block says why it changed nothing, … ([0d78b38](https://github.com/rbenzing/SlimCityGame/commit/0d78b38f4611529973a19313e191c1fdfec42044))
* **zoning:** a zone over a built block says why it changed nothing, and two decisions written down ([25e9f1c](https://github.com/rbenzing/SlimCityGame/commit/25e9f1c714214e09b68a8a1f2b025dd68140ab40))
* **zoning:** the zoning depth is the distance a lot may stand from i… ([34f2ede](https://github.com/rbenzing/SlimCityGame/commit/34f2ede45c6bdc3ae7ef64203f77190982a2e502))
* **zoning:** the zoning depth is the distance a lot may stand from its street ([4648293](https://github.com/rbenzing/SlimCityGame/commit/464829378523a3901ce1162718bd8dd931c2c57b))


### Bug Fixes

* **fields:** land value settles, so a level-up is earned ([1a7ffda](https://github.com/rbenzing/SlimCityGame/commit/1a7ffda1bcd13680d566ee6a07333a31de5ff221))
* **fields:** land value settles, so a level-up is earned ([d64b5c0](https://github.com/rbenzing/SlimCityGame/commit/d64b5c02dbc4f2cb84c5cbd6b62d233eda429f56))
* **roads:** a road through a building is refused whole, not laid in p… ([b636304](https://github.com/rbenzing/SlimCityGame/commit/b636304f12fe55d8de0820e04b2450585acc02d7))
* **roads:** a road through a building is refused whole, not laid in pieces ([9cc1344](https://github.com/rbenzing/SlimCityGame/commit/9cc1344d552b0e796b5e5be16a7b3ccbce64cd58))
* **transit:** a bus stop beside a long block finds its street ([3463344](https://github.com/rbenzing/SlimCityGame/commit/34633447870e2ddcca26a764fa85cbf2870e61be))
* **transit:** a bus stop beside a long block finds its street ([9d31e33](https://github.com/rbenzing/SlimCityGame/commit/9d31e33a63386b70c2028a1851f42870f3f39743))

## [1.34.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.33.3...slimcity-v1.34.0) (2026-10-06)


### Features

* **render:** the stepped silhouette shows — every tier is the body instancer's, with its own windows ([d85955c](https://github.com/rbenzing/SlimCityGame/commit/d85955cba0e00955ec7d4e5c9926a3e9e6a79d89))

## [1.33.3](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.33.2...slimcity-v1.33.3) (2026-10-05)


### Bug Fixes

* **roads:** a walled motorway grows its auxiliary lane, narrowing the shoulder, and the wall steps out with it ([2fe572b](https://github.com/rbenzing/SlimCityGame/commit/2fe572b91e10a2ad1aaa57743b923ff8fcc014a1))

## [1.33.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.33.1...slimcity-v1.33.2) (2026-10-05)


### Bug Fixes

* **render:** kerb cars ask the furniture's junction test, so a corridor's other half is not a crossing ([2ad3fb9](https://github.com/rbenzing/SlimCityGame/commit/2ad3fb95a11e46e19a26410ce8dd83747e4b5ab1))

## [1.33.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.33.0...slimcity-v1.33.1) (2026-10-05)


### Bug Fixes

* **growth:** a town is on septic tanks until Big Town, and the first town is a guarded scenario ([5e13079](https://github.com/rbenzing/SlimCityGame/commit/5e130799b8f79cde8d08bc817e47debca7b7769d))

## [1.33.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.32.0...slimcity-v1.33.0) (2026-10-05)


### Features

* **power:** honest on both sides — capacity factors, a real turbine, and every civic draw sourced ([ab9ed93](https://github.com/rbenzing/SlimCityGame/commit/ab9ed9321fd5984ea68398fb7d36a5e0076a06fe))

## [1.32.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.31.1...slimcity-v1.32.0) (2026-10-02)


### Features

* **water:** a fouled shore, a fouled intake, and a sewage treatment works ([7b545e7](https://github.com/rbenzing/SlimCityGame/commit/7b545e7fccaa574ceb57aa2367d2c7668787e2d1))

## [1.31.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.31.0...slimcity-v1.31.1) (2026-10-02)


### Bug Fixes

* **dev:** the grid read-back hook's type names the pipe layer ([bf74074](https://github.com/rbenzing/SlimCityGame/commit/bf7407492ef5bfd043ec865c8523925292c486f4))

## [1.31.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.30.0...slimcity-v1.31.0) (2026-10-02)


### Features

* **water:** pipes, a pumping station and a drain, and sewage as the third utility ([1d4d27c](https://github.com/rbenzing/SlimCityGame/commit/1d4d27c223f3335caea4fbd419a16941091eaf35))

## [1.30.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.29.0...slimcity-v1.30.0) (2026-10-02)


### Features

* **growth:** industrial kinds by business, and a Heavy Industrial zone ([9e09184](https://github.com/rbenzing/SlimCityGame/commit/9e091849801b07f680e9b7ec3c7462296a430dce))

## [1.29.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.28.0...slimcity-v1.29.0) (2026-10-02)


### Features

* **growth:** commercial kinds, and a business that fits the town ([bd34409](https://github.com/rbenzing/SlimCityGame/commit/bd34409c13fab85931ec141e8c4105d2df430167))

## [1.28.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.27.0...slimcity-v1.28.0) (2026-10-02)


### Features

* **growth:** a zoned lot grows a kind of building, residential kinds first ([0379d1c](https://github.com/rbenzing/SlimCityGame/commit/0379d1cb8424df5e0f66fbfa62fbb154fc9be0c1))

## [1.27.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.26.0...slimcity-v1.27.0) (2026-10-02)


### Features

* **growth:** a house off a dirt road pumps its own well ([6a73bc7](https://github.com/rbenzing/SlimCityGame/commit/6a73bc7c99841c1305ca13686984c02552b3e7fc))

## [1.26.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.25.0...slimcity-v1.26.0) (2026-10-01)


### Features

* **traffic:** a roundabout entry gives way to the ring ([9378990](https://github.com/rbenzing/SlimCityGame/commit/937899032fc86d2cb0a24ad8ae58c2b1d59278ad))


### Bug Fixes

* **commands:** a batch lands whole or not at all ([4aef6a4](https://github.com/rbenzing/SlimCityGame/commit/4aef6a4d3221948c8ff89a4e5d89e4961c3d382f))

## [1.25.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.24.2...slimcity-v1.25.0) (2026-10-01)


### Features

* **roads:** a T onto a corridor with no median is a full junction ([b8c6b22](https://github.com/rbenzing/SlimCityGame/commit/b8c6b222bd1c2d2807b5d52324334f2d59b999e1))

## [1.24.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.24.1...slimcity-v1.24.2) (2026-10-01)


### Bug Fixes

* **render:** light and sign a corridor as the road it is ([f32c5dc](https://github.com/rbenzing/SlimCityGame/commit/f32c5dc9719d218356df5bcb64b62f93143e8436))

## [1.24.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.24.0...slimcity-v1.24.1) (2026-10-01)


### Bug Fixes

* **roads:** bulldoze a corridor whole, and undo a bulldoze the way it stood ([7e4a888](https://github.com/rbenzing/SlimCityGame/commit/7e4a888199e58fc41db73dc8d503d6bbbab35f8d))

## [1.24.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.23.1...slimcity-v1.24.0) (2026-10-01)


### Features

* **roads:** sound walls along motorways and slip roads ([04c0937](https://github.com/rbenzing/SlimCityGame/commit/04c09379613be0ec11a6ccacb7cd179850867f07))

## [1.23.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.23.0...slimcity-v1.23.1) (2026-10-01)


### Bug Fixes

* lenses the right way up, and zoned land that says why it is empty ([ee1fd37](https://github.com/rbenzing/SlimCityGame/commit/ee1fd37a6d8e7ed2a036e8453ab9ba7b09c5cdee))

## [1.23.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.22.0...slimcity-v1.23.0) (2026-10-01)


### Features

* **roads:** lay a compact roundabout on a junction in one click ([d801ee9](https://github.com/rbenzing/SlimCityGame/commit/d801ee9b55821f69f37ef74a14b930de0a293566))
* **roads:** lay a compact roundabout on a junction in one click ([a9873f6](https://github.com/rbenzing/SlimCityGame/commit/a9873f62af9b5e0a2e90d2f4a63582efce6ce2fa))

## [1.22.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.21.0...slimcity-v1.22.0) (2026-09-30)


### Features

* **roads:** lay a whole interchange on a motorway in one click ([b52bd96](https://github.com/rbenzing/SlimCityGame/commit/b52bd9642126d50d44be496f6a09d99a7de41a71))
* **roads:** lay a whole interchange on a motorway in one click ([cb08da9](https://github.com/rbenzing/SlimCityGame/commit/cb08da9a99589e62b95b90637fb37b896b6777cf))


### Bug Fixes

* **roads:** a two-way lane drop closes both sides together ([533d5c0](https://github.com/rbenzing/SlimCityGame/commit/533d5c07efda744851c9ada8c65aeb9da727d87c))
* **roads:** a two-way lane drop closes both sides together ([e446953](https://github.com/rbenzing/SlimCityGame/commit/e446953427a5f4bd4dcf6307957bd531ee5d5f3b))

## [1.21.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.20.2...slimcity-v1.21.0) (2026-09-30)


### Features

* **roads:** an undivided arterial laid across two tiles draws as one road ([5505436](https://github.com/rbenzing/SlimCityGame/commit/55054361b6dc01bed9a8d5d086cc0211dbef0f1a))
* **roads:** an undivided arterial laid across two tiles draws as one road ([75a7a83](https://github.com/rbenzing/SlimCityGame/commit/75a7a83773a2680639013ad62207c147aa4edbe1))
* **roads:** the ghost stands at its deck, and a road can pass under a bridge ([537410b](https://github.com/rbenzing/SlimCityGame/commit/537410b5be133fe7fbf396f560143a919cab917b))
* **roads:** the ghost stands at its deck, and a road can pass under a bridge ([7bcf928](https://github.com/rbenzing/SlimCityGame/commit/7bcf928ce87e7be189ba9164f307bacfb8e3281d))


### Bug Fixes

* **roads:** ghost a corridor as laid, and never split one ([647350d](https://github.com/rbenzing/SlimCityGame/commit/647350d499c292722c0b28d0c136caaebe5c3b51))
* **roads:** no kerb step at a short stub's taper or a ramp node ([6de8720](https://github.com/rbenzing/SlimCityGame/commit/6de8720f156e6f6e966cfdb50aa31c177582ffeb))
* **roads:** no kerb step at a short stub's taper or a ramp node ([cad748d](https://github.com/rbenzing/SlimCityGame/commit/cad748d6bf23c50303c7525e4959ac58d72ec591))

## [1.20.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.20.1...slimcity-v1.20.2) (2026-09-30)


### Bug Fixes

* **roads:** a motorway laid across two tiles draws as one carriageway ([b8293d3](https://github.com/rbenzing/SlimCityGame/commit/b8293d3c1e9c989f3742f938a625cea471a1ab49))

## [1.20.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.20.0...slimcity-v1.20.1) (2026-09-30)


### Bug Fixes

* **roads:** turn bays draw whole across chunk seams, arrows at standard size ([6815bb6](https://github.com/rbenzing/SlimCityGame/commit/6815bb62a0a82982e9da71e4e90f92ffba54914f))

## [1.20.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.19.0...slimcity-v1.20.0) (2026-09-30)


### Features

* **roads:** the median opens where a street crosses a six-lane road ([c744b13](https://github.com/rbenzing/SlimCityGame/commit/c744b13b5e6cd411db95bc5761670be3542d572c))

## [1.19.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.18.0...slimcity-v1.19.0) (2026-09-30)


### Features

* **farms:** an Agriculture zone on soil the ground itself grades ([876424b](https://github.com/rbenzing/SlimCityGame/commit/876424bfbef4944be99044aae4027201a7cefef0))
* **trams:** a tramway crosses another street straight over the junction ([1eca637](https://github.com/rbenzing/SlimCityGame/commit/1eca63726484cc89f5b34fadbc6c10cc53545dda))

## [1.18.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.17.1...slimcity-v1.18.0) (2026-09-29)


### Features

* **demand:** a small town grows like a farming or mill town ([4412cf6](https://github.com/rbenzing/SlimCityGame/commit/4412cf60db45dbad521fd36dfc492a42ca554e17))
* motorways and ramps one-way; a small town grows like a farming or mill town ([c8fbbf3](https://github.com/rbenzing/SlimCityGame/commit/c8fbbf375eda4633645d9494a316a769f1562aba))
* **roads:** motorways and ramps are driven only the way they flow ([9c9d6d6](https://github.com/rbenzing/SlimCityGame/commit/9c9d6d69ef4882fd51ac795b19fba748b58ae336))

## [1.17.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.17.0...slimcity-v1.17.1) (2026-09-29)


### Bug Fixes

* **advisor:** measure the labour market against the workforce ([bf00e76](https://github.com/rbenzing/SlimCityGame/commit/bf00e76e8af564abc222259cf20beeac9c90445c))
* **advisor:** measure the labour market against the workforce; sweep the docs against the code ([877283f](https://github.com/rbenzing/SlimCityGame/commit/877283f78221d9cec21a22f5d7244a58da5fcf3d))

## [1.17.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.16.0...slimcity-v1.17.0) (2026-09-29)


### Features

* **power:** a short grid goes dark from its far end, and the advisor says so ([edf4aa7](https://github.com/rbenzing/SlimCityGame/commit/edf4aa7da89e7badb386e86e16f3d0657330758a))
* **power:** a short grid goes dark from its far end, and the advisor… ([9c70a25](https://github.com/rbenzing/SlimCityGame/commit/9c70a25604f20d2af0fb1820c5a87ca251642005))

## [1.16.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.15.0...slimcity-v1.16.0) (2026-09-28)


### Features

* **homes:** homes face their street, with drives, garages and yards ([8234560](https://github.com/rbenzing/SlimCityGame/commit/82345605c6ee5987539e2bfc4f2b703e8327cd3b))
* **homes:** homes face their street, with drives, garages and yards ([b9270d9](https://github.com/rbenzing/SlimCityGame/commit/b9270d94691987907e6a70d4db9d0a8faccd2255))


### Bug Fixes

* **buildings:** a home that levels up no longer leaves its old roof behind ([2574d17](https://github.com/rbenzing/SlimCityGame/commit/2574d17f616a51d2714d0920d1ccaf1888cff5f6))

## [1.15.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.14.0...slimcity-v1.15.0) (2026-09-28)


### Features

* **roads:** a grid drag from a curve's end brings that end onto the tile centre ([86c4568](https://github.com/rbenzing/SlimCityGame/commit/86c45689ee4cb3e6c69d497cf9d90cffe9aa1245))
* **roads:** a road laid with snapping off stays a road of its own ([f20a6c8](https://github.com/rbenzing/SlimCityGame/commit/f20a6c814cf184197d44946457c9fee1fba7a75a))
* **roads:** a Roads snap toggle, and drags that carry on from road ends ([bca1125](https://github.com/rbenzing/SlimCityGame/commit/bca11258132a4bf2f8fa293a6f3d709a3ab94731))
* **roads:** snapping to roads — a Roads toggle, road-end snapping, roads laid apart ([79469fe](https://github.com/rbenzing/SlimCityGame/commit/79469fee1a61a98312920a47343cc42a0234d171))


### Bug Fixes

* **roads:** a free road's dead end rounds off, and a junction stays on its tile ([9e42486](https://github.com/rbenzing/SlimCityGame/commit/9e42486d45f8f3d9837544597bbb530c0070bd3a))
* **roads:** a grid drag into a road off the grid is refused in the preview ([068f24c](https://github.com/rbenzing/SlimCityGame/commit/068f24c58092d1731972ce13206974392967b434))
* **roads:** a grid tile a free road meets is drawn once, by its junction ([c518ead](https://github.com/rbenzing/SlimCityGame/commit/c518eadf526149ed55a3675a4a99cb3d1b842a69))
* **trees:** no tree stands on a road, a curve or a building, loaded or live ([61b080a](https://github.com/rbenzing/SlimCityGame/commit/61b080a6ac6240cb3ac0c7ddd81934049a666f6c))

## [1.14.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.13.0...slimcity-v1.14.0) (2026-09-25)


### Features

* **ui:** road tool options as panels beside the cards ([26bd231](https://github.com/rbenzing/SlimCityGame/commit/26bd2314ca24a327a9bdf277f54c8cd696e692aa))
* **ui:** road tool options as panels beside the cards ([77aec6e](https://github.com/rbenzing/SlimCityGame/commit/77aec6e9b7c3e6e1e4dcabd9fae7cb58dccb063b))


### Bug Fixes

* **roads:** a bridge ramp at the steepest grade joins its deck ([d274dbe](https://github.com/rbenzing/SlimCityGame/commit/d274dbed58270ed3bf5e7c5f1fcb1bf694513fa6))
* **roads:** a bridge ramp at the steepest grade joins its deck ([6bdd636](https://github.com/rbenzing/SlimCityGame/commit/6bdd636cfd9c86ae35d84b32f225af9a629de35a))

## [1.13.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.12.0...slimcity-v1.13.0) (2026-09-24)


### Features

* **roads:** free-form roads, stage 5 — the curve tool ([5730bc3](https://github.com/rbenzing/SlimCityGame/commit/5730bc3a8a6c0e36b63d86052943bbe5cd42f100))
* **roads:** free-form roads, stage 5a — the curve tool ([2537766](https://github.com/rbenzing/SlimCityGame/commit/253776683cc7753558eed136c5d9da06766f0377))
* **roads:** free-form roads, stage 5b — straights at any angle, splitting, carrying on ([a2f2b4a](https://github.com/rbenzing/SlimCityGame/commit/a2f2b4a0ae9c7953fcefcc076d3c41cdd48ddd72))
* **roads:** free-form roads, stage 5c — guide snapping off the grid ([dec70ae](https://github.com/rbenzing/SlimCityGame/commit/dec70ae9fc3603f09991f19feefda901edbf98b7))

## [1.12.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.11.2...slimcity-v1.12.0) (2026-09-24)


### Features

* **roads:** free-form roads, stage 1 — the network is the road store ([74683ae](https://github.com/rbenzing/SlimCityGame/commit/74683aef189e071322a5727fdf2cd5b6eef6f349))
* **roads:** free-form roads, stage 2 — the graph and the spreads walk the network ([62d44ee](https://github.com/rbenzing/SlimCityGame/commit/62d44ee670edf7e5c2f6bdb754e0c72487cced4d))
* **roads:** free-form roads, stage 3a — the world holds roads off the grid ([7e21388](https://github.com/rbenzing/SlimCityGame/commit/7e21388d9c19389962ae3a7d86175144346cdf0a))
* **roads:** free-form roads, stage 3b — the simulation reads roads off the grid ([e1cbab0](https://github.com/rbenzing/SlimCityGame/commit/e1cbab0a068c783900aa664530cf9ef63cf4bf31))
* **roads:** free-form roads, stage 3c — the land reads roads off the grid ([a10eed5](https://github.com/rbenzing/SlimCityGame/commit/a10eed518248aeacceba2fb23401ff6bfa6e0e17))
* **roads:** free-form roads, stage 4a — the render thread draws roads off the grid ([7be0316](https://github.com/rbenzing/SlimCityGame/commit/7be0316be7f0eafba50133bea509253955f07b0f))
* **roads:** free-form roads, stage 4b — lamps along roads off the grid ([e515e8c](https://github.com/rbenzing/SlimCityGame/commit/e515e8c0bf90c90c6075a1c75240b071f2e2ee79))
* **roads:** free-form roads, stage 4c — vehicles follow roads off the grid ([97ec0bd](https://github.com/rbenzing/SlimCityGame/commit/97ec0bd59787a2e0a2aeb40df7c1d53f6b9eff3e))
* **roads:** free-form roads, stages 1–4, and the end of overpasses ([0024cf0](https://github.com/rbenzing/SlimCityGame/commit/0024cf0d8f4eebba5bda359df16a2ede2d63bb26))

## [1.11.2](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.11.1...slimcity-v1.11.2) (2026-09-24)


### Bug Fixes

* **roads:** a short block gets a shared turn lane only where both end… ([2138c05](https://github.com/rbenzing/SlimCityGame/commit/2138c05aafa79a462edb672358bf3a6901507757))

## [1.11.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.11.0...slimcity-v1.11.1) (2026-09-24)


### Bug Fixes

* **roads:** a one-way street past a crossing runs the way it was drawn ([570499e](https://github.com/rbenzing/SlimCityGame/commit/570499e7cdd171f8b2ab4e34fd3eb5f5cd147b4e))
* **roads:** rail sits outside the road ranking ([47c6d2f](https://github.com/rbenzing/SlimCityGame/commit/47c6d2f7385e976d788316be96ab88a81ae5ac9a))
* **roads:** the world refuses a head-on ramp, not only the tool ([5e725e6](https://github.com/rbenzing/SlimCityGame/commit/5e725e6cd9ec97686556202e755fb2804f29ffff))
* **roads:** the world refuses a street on a motorway, and rail cuts a street cleanly ([c4938a8](https://github.com/rbenzing/SlimCityGame/commit/c4938a80cf89d1fc91ed6db02b50bb775c858c08))
* **roads:** turn arrows, bends and meters face the side they belong to ([d2b961a](https://github.com/rbenzing/SlimCityGame/commit/d2b961a19cc12ade1e88482e7b928607cc5d92d1))

## [1.11.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.10.0...slimcity-v1.11.0) (2026-09-24)


### Features

* **roads:** ramps meet a motorway alongside it and taper in, never head-on ([e59c974](https://github.com/rbenzing/SlimCityGame/commit/e59c9745612c336bc5fb552f8fd4cbb0212f24b4))


### Bug Fixes

* **roads:** a merge or diverge is not an intersection ([ba6280f](https://github.com/rbenzing/SlimCityGame/commit/ba6280fbc71117c501dc2024ed6671bc5009add5))
* **roads:** a motorway is one carriageway, and its paint says which side is which ([a02ba84](https://github.com/rbenzing/SlimCityGame/commit/a02ba84df247bcb086501b785077cdac36d7062d))
* **roads:** a road heading south or west is laid the right way round ([61b2c8e](https://github.com/rbenzing/SlimCityGame/commit/61b2c8e2674d2567662a097837c7151852265f1d))
* **roads:** a road heading south or west is laid the right way round ([3ede2e6](https://github.com/rbenzing/SlimCityGame/commit/3ede2e6dff7f3ce76a666371a207d1787c75eb29))
* **roads:** carriageways side by side stay apart, and signs face their drivers ([90a2c37](https://github.com/rbenzing/SlimCityGame/commit/90a2c37296483edfce90a97bbdbfa97efc9f773f))
* **roads:** two carriageways need ground between them, and the version is one number ([6a6f661](https://github.com/rbenzing/SlimCityGame/commit/6a6f661dd2a7bd356b962075d65f36a859e1c9f5))

## [1.10.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.9.0...slimcity-v1.10.0) (2026-09-21)


### Features

* **services:** a facility serves people, not just an area ([bb95802](https://github.com/rbenzing/SlimCityGame/commit/bb95802c60b9ec493dd9e96aaa9941e8b70e1033))
* **ui:** the Services panel, where funding becomes reachable at last ([957a355](https://github.com/rbenzing/SlimCityGame/commit/957a355eede4eb7419f245862be024adc8e6aa0a))


### Bug Fixes

* **render:** a person is 1.75 m, and one table measures the whole fleet ([4f147f8](https://github.com/rbenzing/SlimCityGame/commit/4f147f82e8888d13eba4d274372723b94eb14e7c))
* **sim:** a generator that cannot deliver says so, and 0% stops reading as — ([9bccdf7](https://github.com/rbenzing/SlimCityGame/commit/9bccdf70427a2489daf912f61f84f0a9be37e1f2))

## [1.9.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.8.0...slimcity-v1.9.0) (2026-09-17)


### Features

* **roads:** a Guide chip pulls a drag into line with the road it nearly continues ([3f0b799](https://github.com/rbenzing/SlimCityGame/commit/3f0b7992b25f6ee251a8361b12f8ebf5df8b36e0))
* **roads:** a road's tier is its size, and a reserved lane is priced on top ([8845bdd](https://github.com/rbenzing/SlimCityGame/commit/8845bdd71225b9c300c34eaefb0907e183d4a368))
* **roads:** Grid mode lays the street grid a drag encloses ([1404c00](https://github.com/rbenzing/SlimCityGame/commit/1404c0011c438f00467aeff5b861c8868424c7f5))
* **ux:** the road ghost is drawn at the road's own width, not the tile's ([050c53f](https://github.com/rbenzing/SlimCityGame/commit/050c53f4c1cbcb752d372e529a091efad07ec7c3))


### Bug Fixes

* **tools:** measure the road SURFACE, not a stored height — and retract the finding ([4621ed0](https://github.com/rbenzing/SlimCityGame/commit/4621ed0492eb260fafb9f1e5ae7a3827afb754e9))

## [1.8.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.7.0...slimcity-v1.8.0) (2026-09-15)


### Features

* **roads:** a bus lane and a tramway are options on a road, not road… ([a54352f](https://github.com/rbenzing/SlimCityGame/commit/a54352fb5032efd4b8171fc027b80c4d20d3e993))
* **roads:** a bus lane and a tramway are options on a road, not roads of their own ([f4b856d](https://github.com/rbenzing/SlimCityGame/commit/f4b856ddc68f3df0570bd58d6abd2f8f6aa4727f))

## [1.7.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.6.1...slimcity-v1.7.0) (2026-09-15)


### Features

* **roads:** a short block gets one shared turn lane, not two bays fighting ([948b863](https://github.com/rbenzing/SlimCityGame/commit/948b8639debbd1d2a2d4ecc4050e1ee90c9aee90))
* **roads:** a transit lane is a variant of a size, not a road type of its own ([d96f3fd](https://github.com/rbenzing/SlimCityGame/commit/d96f3fd249e770f22fe47e377034f43ec916d44f))


### Bug Fixes

* **roads:** the edge line reaches the tile edge, so a junction does not cut it ([2c50aaa](https://github.com/rbenzing/SlimCityGame/commit/2c50aaaca39fdf73e05fda96f0ddc530a445b012))
* **roads:** the paint follows the kerb, and a broken line is 10 ft in 30 ([ddc10b2](https://github.com/rbenzing/SlimCityGame/commit/ddc10b2301299682935f28a5d9612256e605bddf))
* **roads:** the shared turn lane asks every through lane, so a four-lane fits one ([db37b74](https://github.com/rbenzing/SlimCityGame/commit/db37b74c551caa6f29480d396f04b91e505bce5d))

## [1.6.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.6.0...slimcity-v1.6.1) (2026-09-14)


### Bug Fixes

* **roads:** a turn needs a leg to land on ([b4e760a](https://github.com/rbenzing/SlimCityGame/commit/b4e760a0cc60c89c3783616b30ce492898796a0b))
* **roads:** an alley is an access, not a leg of the junction ([75c3f81](https://github.com/rbenzing/SlimCityGame/commit/75c3f81679bbf6e19dfb79b31c43c3591471fde2))
* **roads:** an alley takes no turn bay of its own either ([6185fc6](https://github.com/rbenzing/SlimCityGame/commit/6185fc64f5fc97dd0a045651ad022d6ed4975bd0))
* **roads:** put the crossing against the kerb, and none over an alley ([4833eda](https://github.com/rbenzing/SlimCityGame/commit/4833eda31adcb5e9ea5bf8f0a32815375987b868))

## [1.6.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.5.1...slimcity-v1.6.0) (2026-09-14)


### Features

* **ui:** the menu says which build it is ([f9dec21](https://github.com/rbenzing/SlimCityGame/commit/f9dec2146ac53b9b9b0d00e7a2e291ed0988c6cc))


### Bug Fixes

* **roads:** a road bends into a width change whatever it is made of ([199654a](https://github.com/rbenzing/SlimCityGame/commit/199654a0cc5ffbbfc5c582a2f1ec90408cfcd6b2))
* **roads:** stand a signal's mast at the kerb so its arm reaches the lanes ([17f28d7](https://github.com/rbenzing/SlimCityGame/commit/17f28d7044d87eb60607c8082000bb322e450a33))
* **roads:** turn the corner the arms make, and keep motorways off the street grid ([d4df54e](https://github.com/rbenzing/SlimCityGame/commit/d4df54e5ff89236750869265382e64edd12afc86))

## [1.5.1](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.5.0...slimcity-v1.5.1) (2026-09-09)


### Bug Fixes

* **roads:** a kerb turns through its class radius, not the tile left over ([b0e56c1](https://github.com/rbenzing/SlimCityGame/commit/b0e56c12d2433ae65fd0d3e39c48fd2baddb0b65))
* **roads:** a kerb turns through its class's radius, not the tile left over ([edd4ec4](https://github.com/rbenzing/SlimCityGame/commit/edd4ec4133c2094e85025ed41e8f5544ad4ac874))
* **roads:** a stop line stops at the centreline, not across the road (MUTCD 3B.16) ([9dc0513](https://github.com/rbenzing/SlimCityGame/commit/9dc05138d9cd6e92835bc384ce020354f7f3c561))
* **roads:** bike-lane and bus-lane edge lines, and the stop line extent ([5f9c498](https://github.com/rbenzing/SlimCityGame/commit/5f9c498656d57de8552b4fbc51dd36fce924f9d5))

## [1.5.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.4.0...slimcity-v1.5.0) (2026-09-08)


### Features

* **roads:** a 20 m tile, so a street can afford its own pavements ([f5f03bc](https://github.com/rbenzing/SlimCityGame/commit/f5f03bcc1619a61199d8c6a815d0bc53307af43f))
* **roads:** the avenue pays for its footways, and a crossing lands on them ([de28d01](https://github.com/rbenzing/SlimCityGame/commit/de28d01f1ac7395a8cb48071230732ae2dd0745f))
* **roads:** the player says what each LANE of an approach may do ([2df1dde](https://github.com/rbenzing/SlimCityGame/commit/2df1dde3ed9b53a185045943b30ba010846eb8f8))
* **roads:** the road tool lays a corridor as two carriageways ([e46e40f](https://github.com/rbenzing/SlimCityGame/commit/e46e40f664c6ee0cd007f14c92f36e06d296b608))


### Bug Fixes

* **buildings:** a detached home is house-sized, not hall-sized ([0984527](https://github.com/rbenzing/SlimCityGame/commit/0984527252be44c62c6aa39f85e8159ad9d015a6))
* **buildings:** a plan is a size in metres, not a share of the tile ([f7ae510](https://github.com/rbenzing/SlimCityGame/commit/f7ae510676abc72f31996ea4c41bd51ba1c84462))
* **roads:** a corridor half can find the junction it arrives at ([d49b1ad](https://github.com/rbenzing/SlimCityGame/commit/d49b1ad7ef851422878c8cd6e706ca0a0df8c596))
* **roads:** a divided road is marked as one, and its covers sit on the centreline ([c741d1d](https://github.com/rbenzing/SlimCityGame/commit/c741d1d3d42f39190cbd07f3398a76efe5d4d28c))
* **roads:** a one-way's yellow edge follows the way it runs (MUTCD 3B.07) ([6130345](https://github.com/rbenzing/SlimCityGame/commit/61303457a448433dd602fc607e85109519834d4f))
* **roads:** a road runs one way whichever way it runs ([d882c85](https://github.com/rbenzing/SlimCityGame/commit/d882c85211c80349678a8735bb9fdc71a91455d5))
* **roads:** manhole spacing is counted from the tile, not written down ([c1eab68](https://github.com/rbenzing/SlimCityGame/commit/c1eab6825645d22f7e0cd6fb2e3d32697fd30418))
* **roads:** paint follows the road through a change of width ([4082243](https://github.com/rbenzing/SlimCityGame/commit/4082243453f7d2cf4e920851084401f62e3a9cfc))
* **roads:** the footway carries on round the corner, through the junction ([03e6c46](https://github.com/rbenzing/SlimCityGame/commit/03e6c46996d15d079909b2ac53236303690d3b31))
* **roads:** the median is drawn where the section puts it, trees included ([2e6e0e1](https://github.com/rbenzing/SlimCityGame/commit/2e6e0e1b5951b610dcfec554513d48438f9f7994))
* **tools:** the shot harnesses read the tile size from the app ([7b6d2cd](https://github.com/rbenzing/SlimCityGame/commit/7b6d2cd099b98629491450bf5d5aa958f767da27))

## [1.4.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.3.0...slimcity-v1.4.0) (2026-09-07)


### Features

* archetypes that say what a building does ([ab93495](https://github.com/rbenzing/SlimCityGame/commit/ab93495b26d9770b893689c55b4da79bbfc78529))
* lot pads that claim the ground, and one rule for who parks where ([c3b682a](https://github.com/rbenzing/SlimCityGame/commit/c3b682abfe8fda3846ec5a9e444f3f0d33428a2d))
* one calibrated material palette for the whole city ([dc81505](https://github.com/rbenzing/SlimCityGame/commit/dc81505d1759cb8dbd823aa3f03e07ec4296e64a))
* **power:** a dirt track has no cable in it ([e641550](https://github.com/rbenzing/SlimCityGame/commit/e641550d86d13df11c405499f9359fbf70ed7cbc))
* **power:** a power line carries supply where a road cannot ([54e2ab5](https://github.com/rbenzing/SlimCityGame/commit/54e2ab54d9c939e920f423439078e2dd077d973f))
* **power:** a street carries lamps only where the grid has reached it ([5e3c031](https://github.com/rbenzing/SlimCityGame/commit/5e3c0318429e9c49fb442fda96a519160979d6ef))
* **power:** string a power line and watch the poles go up ([b7c0c69](https://github.com/rbenzing/SlimCityGame/commit/b7c0c69be578f50da2dfd5382088b2df561bcf4d))
* **roads:** a banned turn is a turn nobody takes ([08e50c8](https://github.com/rbenzing/SlimCityGame/commit/08e50c80820e912a741dee64920707d8cb9832d2))
* **roads:** a big road may be two tiles wide ([28694a7](https://github.com/rbenzing/SlimCityGame/commit/28694a70274de6c54db6be33daff9cb9e15bd79d))
* **roads:** a class drawer on the road tool — lanes, median, posted speed ([3c5c819](https://github.com/rbenzing/SlimCityGame/commit/3c5c81909801d397a426dfd757fedecbbc06149f))
* **roads:** a corridor is two carriageways, and its halves are not a junction ([222b9e9](https://github.com/rbenzing/SlimCityGame/commit/222b9e90b95075b475b07ced4c118e74222eadc6))
* **roads:** a corridor's halves draw as two marked carriageways ([7cfd755](https://github.com/rbenzing/SlimCityGame/commit/7cfd755ba6a91b94d04606cc23950d5fd8fafae5))
* **roads:** a junction can be made a roundabout ([68a98a2](https://github.com/rbenzing/SlimCityGame/commit/68a98a2f3d87ad2f22fcaf3981e05d2e4470696b))
* **roads:** a lane does not stop dead, it closes over a taper ([e7b6a28](https://github.com/rbenzing/SlimCityGame/commit/e7b6a28c0017d35173d62502b8ac601db2d2c211))
* **roads:** a lane is a set of movements, and the arrows say which ([be42272](https://github.com/rbenzing/SlimCityGame/commit/be422720ee8e1249cdec5acee3f3103c8278edd4))
* **roads:** a motorway closes a lane with paint and keeps the tarmac ([98df917](https://github.com/rbenzing/SlimCityGame/commit/98df917963459bcf7196676f05ff87a3507b4575))
* **roads:** a motorway grows a lane beside the slip road it meets ([4529a72](https://github.com/rbenzing/SlimCityGame/commit/4529a7250c4abd652df9c090f53019559ed15abc))
* **roads:** a Profile row on the road tool — parking and bike lanes per kerb, footways on or off ([8dadbed](https://github.com/rbenzing/SlimCityGame/commit/8dadbed2d61fb1c8a29ff05d49dbbf8be105e840))
* **roads:** a Replace chip, so a road can be rebuilt as something else ([095da3a](https://github.com/rbenzing/SlimCityGame/commit/095da3aee959d4d0115904742264928dd566e287))
* **roads:** a road need not be the same both ways ([cc306ea](https://github.com/rbenzing/SlimCityGame/commit/cc306eade760089f08fcee9940d6c307186b181e))
* **roads:** a road runs the way it was drawn ([cdf9ba4](https://github.com/rbenzing/SlimCityGame/commit/cdf9ba4bd0d73cbbfb3f40742d7bd7aa0de7b53a))
* **roads:** a slip road's two ends are not the same kind of place ([d7978f1](https://github.com/rbenzing/SlimCityGame/commit/d7978f1f6b925fe04fa66d69d78230e15f158261))
* **roads:** a street earns a turn lane at the junction that needs one ([432653f](https://github.com/rbenzing/SlimCityGame/commit/432653f80978044c4abb3ec87423b470804c402a))
* **roads:** a turn bay opens over a taper, it does not start at full width ([5b3546c](https://github.com/rbenzing/SlimCityGame/commit/5b3546c22b43332e716e87faf78a545fcba74d7b))
* **roads:** every junction works out who gives way, and it costs what it costs ([b547e80](https://github.com/rbenzing/SlimCityGame/commit/b547e80684678de117e734bf8ef4b1a5180d24cd))
* **roads:** junctions that read like junctions, at US lane widths ([645becc](https://github.com/rbenzing/SlimCityGame/commit/645becccf2a90bf0db0cff1ab352c8b62485be8f))
* **roads:** markings are read from the cross-section ([b2b14a8](https://github.com/rbenzing/SlimCityGame/commit/b2b14a8b69c73aa01f60edebf5620dfac6fa011c))
* **roads:** roads meet by rule, and a change of width is drawn ([c443b59](https://github.com/rbenzing/SlimCityGame/commit/c443b5941a2633505d37443c06cafd3b632fc629))
* **roads:** the lane that runs out says so, and the drop is felt ([c3bb001](https://github.com/rbenzing/SlimCityGame/commit/c3bb001781ae931c398aadf4cac12a6474f13058))
* **roads:** the mesh draws a composed profile at its own width and kerbs ([b99cef6](https://github.com/rbenzing/SlimCityGame/commit/b99cef680b3e3b5d88b5118df04a393311fa649c))
* **roads:** the profile data model behind every road tier ([09f2946](https://github.com/rbenzing/SlimCityGame/commit/09f29468d92400fc4956347dd3871b3e224b93f5))
* **roads:** the profile is the road's identity; the tier is derived from it ([7390296](https://github.com/rbenzing/SlimCityGame/commit/73902966ecc166dcc5e207a6ca04773d058c73ff))
* **roads:** the round telco pedestal, beside the cabinet it shares a verge with ([ab71591](https://github.com/rbenzing/SlimCityGame/commit/ab71591af8a97128adeb27c9815f347ecca65c96))
* **roads:** the signals run ([f424da1](https://github.com/rbenzing/SlimCityGame/commit/f424da1169aa12d743185fe6c7f723191f53c0ee))
* **roads:** the signs and the paint at a junction follow its control ([c14af08](https://github.com/rbenzing/SlimCityGame/commit/c14af08aa69d57e5f6257545744292fbfea63ac8))
* **roads:** the warrant is a default, and the player overrides it ([4d6d8ff](https://github.com/rbenzing/SlimCityGame/commit/4d6d8fffaecc72c41ccbe4082267dbed2f382565))
* **roads:** turn-lane arrows, and the markings the US standards actually call for ([9934b4e](https://github.com/rbenzing/SlimCityGame/commit/9934b4e8216255f4a6f23745ed0424204bd519f2))
* **roads:** wave 5 begins — the ramp is a road you can draw ([81f2d10](https://github.com/rbenzing/SlimCityGame/commit/81f2d105ce6e826fecdc137df9b91a5886896c02))
* route transit by mode, over rail or road ([8da9203](https://github.com/rbenzing/SlimCityGame/commit/8da9203becf33cfaf49330c2a177976e2533d095))
* stations, trains, a rail line tool, and lines that survive a save ([2cca56c](https://github.com/rbenzing/SlimCityGame/commit/2cca56c7dbd28a45157d6f13e1deb8fdbfdfb509))
* tram lines over the track the roads epic laid ([05d3dd2](https://github.com/rbenzing/SlimCityGame/commit/05d3dd2277b2d908b95fe51a34e86ce83c778199))


### Bug Fixes

* carry a line's mode over the wire, and check rail in the real app ([34f9c84](https://github.com/rbenzing/SlimCityGame/commit/34f9c84ea423879c098f06cc4cb2380f35677ef5))
* find a stop standing in the middle of a run ([e1daced](https://github.com/rbenzing/SlimCityGame/commit/e1dacedb9e998bc8a9da539c2bc0ea3ab02caa81))
* keep kerbside cars on the tarmac and lamps out of driveways ([76edeab](https://github.com/rbenzing/SlimCityGame/commit/76edeab107798a4c1ae58760bc1db91bb51fc926))
* **roads:** a board faces the traffic it speaks to, and kerb props stand clear of the road ([92640c2](https://github.com/rbenzing/SlimCityGame/commit/92640c23914fd66832b22593fa6b3b2ee03073db))
* **roads:** a drag re-profiles only the tiles it owns ([59021c6](https://github.com/rbenzing/SlimCityGame/commit/59021c60818891375c95005dd789fbaad1b0cf64))
* **roads:** a junction reads the way a junction is painted ([fcfcf4f](https://github.com/rbenzing/SlimCityGame/commit/fcfcf4febb7127bc6ea5207552569a323849a8dd))
* **roads:** a lone tile is a road, not a square of asphalt ([251b903](https://github.com/rbenzing/SlimCityGame/commit/251b90320a0d864a0aecf80f368b169035b7b092))
* **roads:** a road is never offered a lane count it cannot be laid in ([0c9379a](https://github.com/rbenzing/SlimCityGame/commit/0c9379a38e679c843e02f9a05c3f441f27fc0874))
* **roads:** kerb furniture measures from the tile's own cross-section ([71fc08d](https://github.com/rbenzing/SlimCityGame/commit/71fc08d007de7eccdf65d9e2b0d2a31626e29d1d))
* **roads:** roads meet as a hierarchy, on one asphalt, with the minor road giving way ([ed8969c](https://github.com/rbenzing/SlimCityGame/commit/ed8969cc62eaa269c19e73ab113e43dbf1504771))
* **roads:** the footway bends with the kerb instead of stepping at the seam ([f1c495e](https://github.com/rbenzing/SlimCityGame/commit/f1c495e35c5c34db30a45d8ffae34e55d365280d))
* **roads:** the sewer covers were there all along, under the asphalt ([9783f76](https://github.com/rbenzing/SlimCityGame/commit/9783f7606b62c5409578e98faa5366db98daced3))
* **saves:** a browser with nowhere to store a city still opens the menu ([3daf4ac](https://github.com/rbenzing/SlimCityGame/commit/3daf4acd1a70ea49301ce34dd313062432ab43ba))
* three console warnings, and the empty draw calls behind one of them ([c902da7](https://github.com/rbenzing/SlimCityGame/commit/c902da707b386f64a3aa7d572669537f526738f8))
* walk pedestrians down the pavement instead of round the house ([3b1001d](https://github.com/rbenzing/SlimCityGame/commit/3b1001d7f3d35f5bb7dbab59233f9f6bb83e6500))

## [1.3.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.2.0...slimcity-v1.3.0) (2026-08-11)


### Features

* advisor panel ranking what is wrong with the city ([4fac4cc](https://github.com/rbenzing/SlimCityGame/commit/4fac4cc27f81a0fa3e6e1f09bba8c54355873a2a))
* bridges and elevated roads, so a road can cross water ([56998a1](https://github.com/rbenzing/SlimCityGame/commit/56998a130453902a201f4506febfbedb83aacb65))
* build a span in the family its road deserves ([ea96b2b](https://github.com/rbenzing/SlimCityGame/commit/ea96b2b14933338a06849ddb27cf8f51ae76ebe1))
* deck-aware road furniture, and tier rules that reach the deck ([7af190e](https://github.com/rbenzing/SlimCityGame/commit/7af190e47357d4175ea1ef6ce5440fc06a4a8055))
* raise and lower roads from the roads panel, and stop elevation leaking ([da72d85](https://github.com/rbenzing/SlimCityGame/commit/da72d853f08bd886e1f44d900940dd198cbb56c4))
* sign motorways like motorways, and show traffic direction while dragging ([bd199e7](https://github.com/rbenzing/SlimCityGame/commit/bd199e70b3a4baaa33317eeba896210033bf581a))


### Bug Fixes

* close the terrain seam, and stop signs growing through cabinets ([a46b0df](https://github.com/rbenzing/SlimCityGame/commit/a46b0dfd0ef8ee56d24a0f82ab20aa3a832fac91))
* light north-south roads too, not just east-west ones ([3944c60](https://github.com/rbenzing/SlimCityGame/commit/3944c60c0a879dfc0ea657bf2c6424df86ec418e))
* put the road on top of its bridge, and keep the deck level ([f9ebcd5](https://github.com/rbenzing/SlimCityGame/commit/f9ebcd52348df53e7073fab01d9a3f6cbc14e81d))
* run a bridge as one paved road, not a row of stacked slabs ([17966fc](https://github.com/rbenzing/SlimCityGame/commit/17966fcabb00195b2beb13d5f13ea97b57c3ff93))
* sample a bridge deck along the run only, so it stops crowning ([d77fa5f](https://github.com/rbenzing/SlimCityGame/commit/d77fa5f51896dfd3d5ee7e9df9230cec8ef23da1))
* size decks and curbside props to the curb a road actually has ([1302807](https://github.com/rbenzing/SlimCityGame/commit/1302807c5e1eeddaad596521a2796c0307eaab25))
* stop the ambient chirp looping, and get furniture out of the road ([55a5e08](https://github.com/rbenzing/SlimCityGame/commit/55a5e08e27c13e3a6b752fa06f7a281b71722da1))

## [1.2.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.1.0...slimcity-v1.2.0) (2026-08-10)


### Features

* city soundscape, UI cues, and a music player fed from public/songs ([de13dec](https://github.com/rbenzing/SlimCityGame/commit/de13decafec2ad79c5d5e6be4e4bbbccee790826))
* light the road under street lamps, not just the lamp head ([24e09c3](https://github.com/rbenzing/SlimCityGame/commit/24e09c3efc5646962453245e01b402cf428ff5fe))


### Bug Fixes

* judge a lot's power and water over its whole footprint ([d96870d](https://github.com/rbenzing/SlimCityGame/commit/d96870d89b3add2fd551d99228e463998e5aaaf6))

## [1.1.0](https://github.com/rbenzing/SlimCityGame/compare/slimcity-v1.0.0...slimcity-v1.1.0) (2026-08-07)


### Features

* add road furniture kit (roads epic R1) ([041747a](https://github.com/rbenzing/SlimCityGame/commit/041747ace49253822a0c9b1ee55135b8314edbb7))
* bus-lane and bike-lane road variants (roads epic R2) ([48272b0](https://github.com/rbenzing/SlimCityGame/commit/48272b0a998070e29a9d6e9c2bc2471ca2856679))
* dedicated rail-track road type (roads epic R4) ([9d04aaf](https://github.com/rbenzing/SlimCityGame/commit/9d04aaf9ecd30dd0f3fe38dcc42038494834c304))
* landfills as operated sites with an entrance office and truck runs ([6b4a166](https://github.com/rbenzing/SlimCityGame/commit/6b4a166cf2843b2cdc3956081cd8a66ca858f429))
* park in front of the building, on a full-frontage lot, by the clock ([bc8288c](https://github.com/rbenzing/SlimCityGame/commit/bc8288cfe57c373d685e37268fe2180f84b00057))
* tram-track road variant (roads epic R3) ([c3e4174](https://github.com/rbenzing/SlimCityGame/commit/c3e4174a8ab92ad230fec1a30fd280078815500f))
* typed traffic signs placed by road-tile role ([f8b0813](https://github.com/rbenzing/SlimCityGame/commit/f8b081395eb50de2b52affb69aaf870ba737e311))


### Bug Fixes

* conform ground meshes to terrain and rebuild roads after height edits ([a9eac34](https://github.com/rbenzing/SlimCityGame/commit/a9eac34f8458650301606c1a5aa1787bbb27d1f0))
* highway dead-end cap reads as a rounded curb, not a sidewalk ([f4701b3](https://github.com/rbenzing/SlimCityGame/commit/f4701b3e3681c2142013f43b681957459acdf772))
* parking bays, kit-model parked cars, terrain-safe lot paving, smooth traffic ([8721d47](https://github.com/rbenzing/SlimCityGame/commit/8721d47aeb3edbb16ec1092fd5838050dad05b12))
* round dead-end caps for wide road tiers ([09077f1](https://github.com/rbenzing/SlimCityGame/commit/09077f1b1786e49284aeedf6d4f353ddc44d11e4))
