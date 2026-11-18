// The working timetable: when each train runs, and which engines take turns on it.
// Read by nwr.js (relief engines leave their depots for the duty's own shed) and ops.js (the day's work).
//
// rota:   the engines that share the duty; the first is the engine built on the train.
// shifts: [on, off, who, days]
//   on, off  24-hour times; a shift that ends before it starts runs through the night.
//   who      the rota index working it, one character per day in turn: '0' always the first engine,
//            '01' the first and second on alternate days, '0000001' the second on Sundays.
//   days     which weekdays the shift runs, Monday first (default: every day).
// The simulation starts on a Monday.
window.SODOR_DUTIES = {
  nwr: {
    gordon:   {rota: ['gordon', 'hank'], shifts: [['05:30', '14:00', '01'], ['14:00', '22:30', '10']],
               note: 'Gordon and Hank share the Express: one takes the early turn and the other the late, changing over at Tidmouth.'},
    rebecca:  {shifts: [['06:00', '21:30', '0']]},
    henry:    {shifts: [['21:30', '05:30', '0']], note: 'The Flying Kipper runs through the night so the fish reaches the market by morning.'},
    james:    {rota: ['james', 'donald'], shifts: [['06:00', '18:30', '01', '1111110']], note: 'James and Donald work the goods on alternate days.'},
    murdoch:  {rota: ['murdoch', 'douglas'], shifts: [['07:00', '18:00', '0', '1111110'], ['19:30', '04:30', '1', '1111100']],
               note: 'Murdoch works the long goods by day and Douglas takes it through the night.'},
    thomas:   {rota: ['thomas', 'rosie'], shifts: [['06:00', '21:00', '0000001']], note: "Rosie works the branch line on Thomas's day off, Sunday."},
    toby:     {shifts: [['07:00', '19:00', '0']]},
    flora:    {shifts: [['08:00', '18:00', '0', '0111111']]},
    edward:   {rota: ['edward', 'ryan'], shifts: [['05:30', '13:30', '01'], ['13:30', '21:30', '10']]},
    boco:     {rota: ['boco', 'dart'], shifts: [['06:00', '18:00', '01', '1111110']]},
    duck:     {shifts: [['05:45', '13:00', '0'], ['15:00', '22:00', '0']]},
    oliver:   {shifts: [['07:00', '19:00', '0', '1111110']]},
    whiff:    {rota: ['whiff', 'scruff'], shifts: [['06:00', '15:00', '01', '1111110']]},
    winston:  {shifts: [['09:00', '16:00', '0', '1111100']]},
    emily:    {shifts: [['06:00', '13:00', '0'], ['15:00', '22:00', '0']]},
    paxton:   {rota: ['paxton', 'norman'], shifts: [['06:00', '17:00', '0', '1111110'], ['20:00', '04:00', '1', '1111100']],
               note: 'Paxton brings the stone down by day and Norman runs the night trains.'},
    nia:      {shifts: [['07:30', '18:30', '0']], note: 'Nia works the goods between Tidmouth and Wellsworth by day and sleeps at Tidmouth Sheds.'},
    percy:    {shifts: [['20:30', '04:30', '0', '1111110']], note: 'Percy takes the mail to Kirk Ronan overnight.'},
    stepney:  {shifts: [['10:00', '17:00', '0', '0010011']], note: 'Heritage trains run on Wednesdays and at weekends.'},
    arthur:   {shifts: [['07:00', '19:00', '0', '1111110']]},
    daisy:    {shifts: [['06:30', '21:30', '0']]},
    stanley:  {rota: ['stanley', 'billy'], shifts: [['07:30', '17:30', '01', '1111100']]},
    belle:    {shifts: [['08:00', '12:00', '0'], ['13:30', '18:00', '0']]},
    salty:    {rota: ['salty', 'sidney'], shifts: [['05:00', '13:00', '0'], ['13:00', '21:00', '1']]},
    diesel10: {rota: ['diesel10', 'dennis'], shifts: [['07:00', '18:00', '1', '1111110'], ['22:00', '06:00', '0', '1111100']],
               note: 'Dennis takes the scrap trucks by day; Diesel 10 prefers the night shift.'},
    bill:     {rota: ['bill', 'timothy'], shifts: [['07:00', '19:00', '01', '1111110']]},
    ben:      {shifts: [['07:00', '19:00', '0', '1111110']]},
  },
  // Skarloey Railway
  sr: {
    skarloey:  {shifts: [['07:00', '19:00', '0']]},
    rheneas:   {shifts: [['07:30', '19:30', '0']]},
    sirhandel: {shifts: [['06:00', '17:00', '0', '1111110']]},
    petersam:  {shifts: [['06:30', '20:00', '0']]},
    rusty:     {shifts: [['05:30', '12:30', '0'], ['15:00', '19:00', '0', '1111100']]},
    duncan:    {shifts: [['06:30', '18:30', '0', '1111110']]},
    freddie:   {shifts: [['07:00', '17:00', '0', '1111100']]},
    duke:      {shifts: [['10:00', '17:00', '0', '0010011']]},
    bertram:   {shifts: [['08:00', '16:00', '0', '1111100']]},
    mightymac: {shifts: [['09:00', '18:00', '0']]},
    luke:      {shifts: [['06:00', '15:00', '0', '1111110']]},
  },
  // Culdee Fell Railway (the mountain trains run in daylight)
  cfr: {
    ernest:  {shifts: [['08:00', '18:00', '0']]},
    culdee:  {shifts: [['08:30', '18:30', '0']]},
    patrick: {shifts: [['09:00', '17:30', '0']]},
    alaric:  {shifts: [['06:30', '11:30', '0', '1111110'], ['13:00', '16:00', '0', '1111110']]},
  },
  // Arlesdale Railway (rota order: the train engine, then its relief engines as listed in characters.js)
  ar: {
    rex:    {shifts: [['08:00', '19:00', '0']]},
    bert:   {shifts: [['08:30', '19:30', '0']]},
    mike:   {shifts: [['07:30', '17:30', '0', '1111110']], note: 'Mike brings the ballast down from the mines, Monday to Saturday.'},
    jock:   {shifts: [['09:30', '18:00', '0', '0000111']], note: 'Jock runs the relief and extra trains at the busy end of the week.'},
    sigrid: {shifts: [['06:30', '09:00', '0'], ['16:30', '19:00', '0']], note: 'Sigrid stays at Arlesdale overnight, ready for the staff train first thing.'},
  },
  // Engines in the depots and yards shunt during these hours and are put away for the rest.
  yards: {
    default: ['06:00', '19:00'],
    tidmouth: ['05:00', '23:00'],                         // the turntable at Tidmouth Sheds
    diesel: ['06:00', '22:00'], den: ['20:00', '06:00'], arry: ['21:00', '05:00'], bert: ['21:00', '05:00'],
    mavis: ['06:00', '20:00'], porter: ['05:00', '21:00'], philip: ['14:00', '23:00'], sonny: ['19:00', '03:00'],
    bash: ['07:00', '17:00'], dash: ['08:00', '18:00'], ferdinand: ['09:00', '16:00'], fergus: ['07:00', '15:00'],
    wilfred: ['07:30', '18:00'], shane: ['08:00', '17:00'], eric: ['09:00', '18:30'], diesel9: ['06:00', '14:00'], diesel10cfr: ['12:00', '20:00'],
  },
};

// What each train does through the day. A working runs from its start time until the next one begins
// (the last carries on round to the first), whichever engine on the rota is out. The kinds (ops.js):
//   express   calls only at the train's usual stations     fast      runs non-stop end to end
//   stopping  calls at every station                       market    every station, with long stops
//   mail      every station, standing while bags are moved pickup    a goods shunting trucks at every station
//   through   a goods running non-stop                     heavy     a slow, heavy goods, non-stop
// [start, kind, what it is, rake]: the rake (from rakes below; 'main' is the train's own) is the stock it
// takes. When the rake changes, the engine shunts the old one into its siding beside the engine shed and
// draws the new one out, the next time it has run round at that end.
window.SODOR_DUTIES.rakes = {
  gordon:  {local: ['suburban', 'suburban', 'suburban', 'suburban']},
  rebecca: {local: ['suburban', 'suburban', 'suburban', 'suburban']},
  henry:   {papers: ['vanGrey', 'vanRed', 'vanGrey', 'vanRed', 'brakeVan']},
  james:   {mixed: ['truck', 'vanGrey', 'truckB', 'oilTank', 'vanBrown', 'brakeVan']},
  murdoch: {vans: ['vanGrey', 'vanBrown', 'vanGrey', 'vanGrey', 'vanBrown', 'vanGrey', 'brakeVan'], mixed: ['truck', 'vanGrey', 'oilTank', 'truckB', 'vanBrown', 'brakeVan']},
  thomas:  {trucks: ['thomasTruck', 'brakeVan']},
  toby:    {stone: ['stoneTruck', 'stoneTruck']},
  edward:  {trucks: ['truck', 'brakeVan'], local: ['suburban']},
  boco:    {mixed: ['truck', 'vanGrey', 'truckB', 'brakeVan']},
  duck:    {local: ['suburban', 'suburban'], goods: ['truck', 'vanGrey', 'truckB', 'toad']},
  oliver:  {tanks: ['oilTank', 'tarTank', 'milkTank', 'toad']},
  emily:   {local: ['suburban', 'suburban'], milk: ['milkTank', 'milkTank', 'milkTank', 'brakeVan']},
  nia:     {mixed: ['truck', 'vanGrey', 'oilTank', 'truckB', 'vanBrown', 'brakeVan']},
  percy:   {parcels: ['vanGrey', 'vanBrown', 'vanGrey', 'brakeVan']},
  paxton:  {mixed: ['truck', 'vanGrey', 'truckB', 'brakeVan']},
  arthur:  {vans: ['vanGrey', 'vanBrown', 'vanGrey', 'brakeVan']},
  diesel10:{scrap: ['thomasTruck', 'thomasTruck', 'thomasTruck', 'brakeVan']},
};
window.SODOR_DUTIES.work = {
  gordon:  [['05:30', 'express', 'the early Express', 'main'], ['09:30', 'fast', 'the non-stop Express to Kellsthorpe Road', 'main'],
            ['16:00', 'express', 'the evening Express', 'main'], ['19:30', 'stopping', 'the late stopping train with the suburban coaches (which Gordon thinks beneath him)', 'local']],
  rebecca: [['06:00', 'stopping', 'the early commuter train, all stations to Barrow', 'local'], ['09:30', 'express', 'the Express on to Vicarstown and Barrow', 'main'],
            ['17:00', 'stopping', 'the evening commuter train, all stations', 'local']],
  henry:   [['21:30', 'fast', 'the Flying Kipper, racing the fish to market', 'main'], ['02:00', 'mail', 'the newspaper train, dropping papers at every station', 'papers']],
  james:   [['06:00', 'pickup', 'the morning pick-up goods, shunting trucks at every station', 'mixed'], ['10:00', 'through', 'the through goods with his blue trucks', 'main'],
            ['15:00', 'pickup', 'the afternoon pick-up goods', 'mixed']],
  murdoch: [['07:00', 'heavy', 'the heavy coal train to Vicarstown', 'main'], ['12:00', 'through', 'the afternoon van train', 'vans'],
            ['19:30', 'through', 'the night goods', 'vans'], ['01:00', 'pickup', 'the early pick-up goods, collecting trucks for the morning', 'mixed']],
  thomas:  [['06:00', 'stopping', "the workmen's train, all stations", 'main'], ['08:00', 'stopping', 'the school train', 'main'], ['09:30', 'market', 'the market train, with long stops for shoppers', 'main'],
            ['12:00', 'pickup', 'the branch goods with his trucks', 'trucks'], ['15:30', 'stopping', 'the afternoon branch train', 'main'], ['17:00', 'stopping', 'the evening commuter train', 'main']],
  toby:    [['07:00', 'stopping', 'the morning tram', 'main'], ['11:00', 'pickup', 'the quarry stone trucks', 'stone'], ['15:00', 'stopping', 'the afternoon tram', 'main']],
  edward:  [['05:30', 'stopping', 'the early commuter train', 'local'], ['09:00', 'market', 'the market train with Old Slow Coach', 'main'],
            ['13:30', 'pickup', 'the branch goods', 'trucks'], ['17:00', 'fast', 'the evening fast train', 'local']],
  boco:    [['06:00', 'through', 'the tanker train to Brendam Docks', 'main'], ['12:00', 'pickup', 'the pick-up goods along the branch', 'mixed']],
  duck:    [['05:45', 'stopping', 'the early commuter train', 'local'], ['09:00', 'fast', "the fast train to Bluff's Cove with the Slip Coaches", 'main'],
            ['15:00', 'pickup', 'the afternoon goods with Toad', 'goods'], ['18:30', 'market', 'the evening stopping train', 'main']],
  oliver:  [['07:00', 'pickup', 'the morning pick-up goods with Toad', 'main'], ['12:00', 'through', 'the tanker train to Arlesburgh', 'tanks']],
  emily:   [['06:00', 'stopping', 'the early commuter train', 'local'], ['09:30', 'fast', 'the fast train with her coaches', 'main'],
            ['15:00', 'through', 'the milk tankers', 'milk'], ['18:30', 'fast', 'the evening fast train', 'main']],
  nia:     [['07:30', 'pickup', 'the pick-up goods, shunting at every station', 'mixed'], ['12:00', 'through', 'the stone train to Wellsworth', 'main'], ['16:00', 'pickup', 'the evening pick-up goods', 'mixed']],
  percy:   [['20:30', 'mail', 'the mail train, loading bags at every station', 'main'], ['00:30', 'through', 'the overnight parcels', 'parcels']],
  daisy:   [['06:30', 'stopping', 'the early commuter service'], ['09:30', 'market', 'the market train, with long stops'],
            ['12:30', 'fast', 'the fast midday service'], ['16:00', 'stopping', 'the evening commuter service']],
  paxton:  [['06:00', 'heavy', 'the heavy stone train', 'main'], ['11:00', 'pickup', 'the pick-up goods', 'mixed'], ['20:00', 'through', 'the night stone train', 'main']],
  arthur:  [['07:00', 'pickup', 'the morning pick-up goods', 'main'], ['13:00', 'through', 'the afternoon van train', 'vans']],
  diesel10:[['07:00', 'pickup', 'the scrap pick-up, collecting trucks along the line', 'main'], ['22:00', 'heavy', 'the night scrap train', 'scrap']],
};

// Workings on the other railways (stops, speed and time at stations change; the trains keep their stock).
window.SODOR_DUTIES.workOther = {
  sr: {
    skarloey:  [['07:00', 'stopping', 'the early passenger train, all stations'], ['10:00', 'market', 'the tourist train, with long stops at the viewpoints'], ['15:00', 'fast', 'the fast afternoon train'], ['17:30', 'stopping', 'the evening train']],
    rheneas:   [['07:30', 'stopping', 'the morning passenger train'], ['11:00', 'fast', 'the fast train to the top'], ['14:00', 'market', 'the tourist train with long stops'], ['17:00', 'stopping', 'the last train down']],
    sirhandel: [['06:00', 'heavy', 'the slate train from the quarry'], ['11:00', 'pickup', 'the pick-up goods along the line'], ['14:00', 'heavy', 'the afternoon slate train']],
    petersam:  [['06:30', 'stopping', 'the workmen\'s train'], ['09:00', 'market', 'the tourist train'], ['13:00', 'fast', 'the fast train'], ['16:00', 'stopping', 'the evening passenger train']],
    rusty:     [['05:30', 'pickup', 'the track gang\'s train, stopping all along the line'], ['09:00', 'heavy', 'the ballast train'], ['15:00', 'pickup', 'the evening works train']],
    duncan:    [['06:30', 'heavy', 'the slate train'], ['10:30', 'pickup', 'the pick-up goods'], ['14:30', 'heavy', 'the afternoon slate train']],
    freddie:   [['07:00', 'pickup', 'the morning goods'], ['12:00', 'through', 'the fast goods']],
    luke:      [['06:00', 'heavy', 'the quarry train'], ['11:00', 'pickup', 'the pick-up goods']],
    mightymac: [['09:00', 'stopping', 'the passenger train'], ['12:30', 'market', 'the tourist train with long stops'], ['15:30', 'fast', 'the fast train home']],
  },
  ar: {
    rex:  [['08:00', 'stopping', 'the morning passenger train'], ['10:30', 'market', 'the holiday train with long stops'], ['14:30', 'fast', 'the fast train'], ['17:00', 'stopping', 'the evening train']],
    bert: [['08:30', 'fast', 'the early fast train'], ['11:00', 'stopping', 'the passenger train'], ['15:00', 'market', 'the holiday train'], ['17:30', 'fast', 'the last fast train']],
    mike: [['07:30', 'heavy', 'the ballast train from the mines'], ['12:00', 'pickup', 'the pick-up goods'], ['14:30', 'heavy', 'the afternoon ballast train']],
  },
  cfr: {
    ernest:  [['08:00', 'stopping', 'the first train up the mountain'], ['11:00', 'fast', 'the fast train to the summit'], ['14:00', 'market', 'the tourist train with long stops'], ['16:30', 'stopping', 'the last train']],
    culdee:  [['08:30', 'fast', 'the early fast train'], ['11:30', 'market', 'the sightseeing train'], ['15:00', 'stopping', 'the afternoon train']],
    patrick: [['09:00', 'stopping', 'the passenger train'], ['12:00', 'mail', 'the supplies train for the summit hotel'], ['14:30', 'stopping', 'the afternoon train']],
  },
};
