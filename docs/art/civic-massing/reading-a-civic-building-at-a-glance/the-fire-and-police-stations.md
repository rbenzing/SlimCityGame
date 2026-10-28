# The fire and police stations

Four stations, one kit: a paved lot with the building on its back and left, the
lot's local +Z the street side, the player turning it to face the road. All four
turn at the four rotations and stand on the highest ground under the lot.

| Station                 | Lot | Height | Stated floor         | Plate × storeys          | Doors and ground                                                                  |
| ----------------------- | --- | ------ | -------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Fire station            | 2×2 | 6.4 m  | ~500 m²              | 18 × 14 m = 252, × 2     | 2 bays, 23 m of apron (18.3 m asked), 5 staff stalls                              |
| District fire station   | 3×2 | 6.4 m  | 15,733 sf = 1,462 m² | 36.6 × 20 m = 732, × 2   | 3 bays, 17 m of apron (50 ft asked), 18 staff stalls, a 4 × 4 × 12.8 m hose tower |
| Police station          | 2×2 | 6.4 m  | 1,420 m²             | 34 × 21 m = 714, × 2     | entrance, sally port, a radio pole, 6 stalls                                      |
| Police district station | 3×3 | 9.6 m  | 38,000 sf = 3,530 m² | 54 × 21.8 m = 1,177, × 3 | entrance and canopy, sally port, 26 stalls, a radio pole                          |

- **Bays.** 18 ft (5.49 m) from door to door, preferred and never under 14 ft;
  each opened by a door 16 ft wide and **15 ft (4.57 m) high**, over the 14 × 14
  ft least (Fire Apparatus Magazine, apparatus floor tips) and 1.27 m over the
  3.3 m engine. A single-deep bay is 40 ft (12.2 m), the apron 50 ft (15.2 m)
  (Fire Engineering, the modern firehouse); the first rung keeps the 14.0 m
  back-in bay and 18.3 m apron of the table above. Door and frame: a dark frame
  0.35 m wider than the leaf all round, the leaf lighter than the wall with five
  panel seams and a row of four panes at the head. The engine, 10 m, stands on
  the concrete apron 1.5 m before its door, one per bay up to the number of
  appliances.
- **The fire stations' floors.** The first rung is two back-in bays at 137 m²,
  quarters, offices and 40% circulation, about 500 m² over two storeys, a 252 m²
  plate. The district rung is Indianapolis Fire Station 20's 15,733 sf, three
  bays, an engine, a ladder and a chief: 1,462 m² over two storeys is a 731 m²
  plate, which the massing rule alone would put on 4 tiles. It does not fit a
  2×2: the plate is 36.6 m wide and a 2×2 lot leaves 34 m inside its margins,
  and the apron and the 18 stalls want the ground besides. So the lot is 3×2,
  60 m of frontage.
- **The police floors.** The first rung is the derived 1,420 m² in two storeys, a
  714 m² plate. The district rung is Concord NH's new 38,000 sf: three storeys is
  a 1,177 m² plate, which a 3×3 holds (1,665 m²); two storeys is 1,765 m², which
  it does not. A 3×3 at three storeys is the least that fits.
- **Parking.** `parkingcode.ts` has no rate for a station: its office rate of 3
  per 1,000 sf is for the downtown kind that parks at the kerb, and is reference
  only. The fire stations are sized on staff, not floor: 5 on-duty positions for
  the first rung, and two shifts of the 9 seats for the district one (the
  shift-change overlap, an assumption), 18 stalls. The police stations take the
  stalls the lot fits before the building's front: the district rung's 26 against
  the office reference's 114 for its floor, no lot of 3,600 m² holding the 2,860 m²
  of stalls and the 1,177 m² plate; the rest is the street's kerb. Stalls are 9 ×
  18 ft with a 24 ft aisle.
- **Police.** The entrance is a marked 2.4 m door on the street face with a
  canopy and two posts, a glazed pair of panes, a blue band across the head of the
  wall and a belt course at every floor. The sally port is a vehicle door 14 ft
  wide and 12 ft high (3.66 m, over the 1.6 m patrol car) with a concrete drive to
  the street and a patrol car before it.
- **Night.** The windows and the door panes are one merged mesh on an emissive
  material that follows the night factor, the one lit part of a station.

