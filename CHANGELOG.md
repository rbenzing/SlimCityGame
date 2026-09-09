# Changelog

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
