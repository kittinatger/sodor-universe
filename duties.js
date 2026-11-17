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
