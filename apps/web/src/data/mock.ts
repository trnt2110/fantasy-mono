export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

export interface Player {
  id: number
  name: string
  club: string
  clubShort: string
  position: Position
  price: number
  totalPoints: number
  form: number
  selected: boolean    // in squad
  isCapitain?: boolean
  isBench?: boolean
}

export interface Fixture {
  id: number
  homeTeam: string
  awayTeam: string
  homeShort: string
  awayShort: string
  kickoff: string
  date: string
  result?: string
}

export const MOCK_PLAYERS: Player[] = [
  // GKP
  { id: 1,  name: 'Raya',       club: 'Arsenal',     clubShort: 'ARS', position: 'GKP', price: 6.0,  totalPoints: 122, form: 7.2, selected: true },
  { id: 2,  name: 'Flekken',    club: 'Brentford',   clubShort: 'BRE', position: 'GKP', price: 4.5,  totalPoints: 88,  form: 5.1, selected: true, isBench: true },
  // DEF
  { id: 3,  name: 'Gabriel',    club: 'Arsenal',     clubShort: 'ARS', position: 'DEF', price: 7.2,  totalPoints: 164, form: 9.0, selected: true },
  { id: 4,  name: 'J.Timber',   club: 'Arsenal',     clubShort: 'ARS', position: 'DEF', price: 6.3,  totalPoints: 148, form: 8.2, selected: true },
  { id: 5,  name: 'Tarkowski',  club: 'Everton',     clubShort: 'EVE', position: 'DEF', price: 5.7,  totalPoints: 136, form: 6.8, selected: true },
  { id: 6,  name: 'Guéhi',      club: 'Man City',    clubShort: 'MCI', position: 'DEF', price: 5.2,  totalPoints: 133, form: 6.5, selected: true },
  { id: 7,  name: 'Virgil',     club: 'Liverpool',   clubShort: 'LIV', position: 'DEF', price: 6.2,  totalPoints: 130, form: 7.8, selected: true, isBench: true },
  // MID
  { id: 8,  name: 'Salah',      club: 'Liverpool',   clubShort: 'LIV', position: 'MID', price: 13.1, totalPoints: 221, form: 12.4, selected: true, isCapitain: true },
  { id: 9,  name: 'Saka',       club: 'Arsenal',     clubShort: 'ARS', position: 'MID', price: 10.2, totalPoints: 189, form: 9.8, selected: true },
  { id: 10, name: 'Palmer',     club: 'Chelsea',     clubShort: 'CHE', position: 'MID', price: 10.8, totalPoints: 195, form: 10.2, selected: true },
  { id: 11, name: 'Mbeumo',     club: 'Brentford',   clubShort: 'BRE', position: 'MID', price: 8.1,  totalPoints: 167, form: 8.6, selected: true },
  { id: 12, name: 'Andreas',    club: 'Fulham',      clubShort: 'FUL', position: 'MID', price: 5.5,  totalPoints: 142, form: 6.2, selected: true, isBench: true },
  // FWD
  { id: 13, name: 'Isak',       club: 'Newcastle',   clubShort: 'NEW', position: 'FWD', price: 8.7,  totalPoints: 178, form: 9.3, selected: true },
  { id: 14, name: 'Watkins',    club: 'Aston Villa', clubShort: 'AVL', position: 'FWD', price: 8.4,  totalPoints: 162, form: 8.0, selected: true },
  { id: 15, name: 'Joao Pedro', club: 'Brighton',    clubShort: 'BHA', position: 'FWD', price: 6.1,  totalPoints: 121, form: 6.4, selected: true, isBench: true },
  // Extra players for selection list
  { id: 16, name: 'Pickford',   club: 'Everton',     clubShort: 'EVE', position: 'GKP', price: 5.0,  totalPoints: 95,  form: 5.5, selected: false },
  { id: 17, name: 'Trippier',   club: 'Newcastle',   clubShort: 'NEW', position: 'DEF', price: 6.5,  totalPoints: 145, form: 7.8, selected: false },
  { id: 18, name: 'Pedro Porro',club: 'Spurs',       clubShort: 'TOT', position: 'DEF', price: 5.8,  totalPoints: 128, form: 6.9, selected: false },
  { id: 19, name: 'Haaland',    club: 'Man City',    clubShort: 'MCI', position: 'FWD', price: 14.3, totalPoints: 208, form: 11.2, selected: false },
  { id: 20, name: 'Diogo Jota', club: 'Liverpool',   clubShort: 'LIV', position: 'FWD', price: 7.8,  totalPoints: 155, form: 8.4, selected: false },
  { id: 21, name: 'Rashford',   club: 'Man Utd',     clubShort: 'MUN', position: 'MID', price: 6.5,  totalPoints: 112, form: 5.3, selected: false },
  { id: 22, name: 'Son',        club: 'Spurs',       clubShort: 'TOT', position: 'MID', price: 9.9,  totalPoints: 174, form: 8.9, selected: false },
  { id: 23, name: 'De Bruyne',  club: 'Man City',    clubShort: 'MCI', position: 'MID', price: 10.0, totalPoints: 168, form: 8.5, selected: false },
]

export const MOCK_FIXTURES: Fixture[] = [
  { id: 1,  homeTeam: 'Arsenal',        awayTeam: 'Chelsea',       homeShort: 'ARS', awayShort: 'CHE', kickoff: '21:00', date: 'Sat 15 Mar' },
  { id: 2,  homeTeam: 'Liverpool',      awayTeam: 'Man City',      homeShort: 'LIV', awayShort: 'MCI', kickoff: '23:30', date: 'Sat 15 Mar' },
  { id: 3,  homeTeam: 'Man Utd',        awayTeam: 'Spurs',         homeShort: 'MUN', awayShort: 'TOT', kickoff: '21:00', date: 'Sun 16 Mar' },
  { id: 4,  homeTeam: 'Newcastle',      awayTeam: 'Everton',       homeShort: 'NEW', awayShort: 'EVE', kickoff: '21:00', date: 'Sun 16 Mar' },
  { id: 5,  homeTeam: 'Brentford',      awayTeam: 'Brighton',      homeShort: 'BRE', awayShort: 'BHA', kickoff: '21:00', date: 'Sun 16 Mar' },
  { id: 6,  homeTeam: 'Aston Villa',    awayTeam: 'West Ham',      homeShort: 'AVL', awayShort: 'WHU', kickoff: '03:00', date: 'Mon 17 Mar' },
  { id: 7,  homeTeam: 'Wolves',         awayTeam: 'Fulham',        homeShort: 'WOL', awayShort: 'FUL', kickoff: '03:00', date: 'Mon 17 Mar' },
  { id: 8,  homeTeam: 'Crystal Palace', awayTeam: 'Ipswich',       homeShort: 'CRY', awayShort: 'IPS', kickoff: '21:00', date: 'Tue 18 Mar' },
  { id: 9,  homeTeam: 'Leicester',      awayTeam: 'Nottm Forest',  homeShort: 'LEI', awayShort: 'NFO', kickoff: '21:00', date: 'Tue 18 Mar' },
  { id: 10, homeTeam: 'Southampton',    awayTeam: 'Bournemouth',   homeShort: 'SOU', awayShort: 'BOU', kickoff: '21:00', date: 'Wed 19 Mar' },
]

export const FORMATION = '4-3-3'

export const SQUAD_BY_POSITION = {
  GKP: MOCK_PLAYERS.filter(p => p.position === 'GKP' && p.selected && !p.isBench),
  DEF: MOCK_PLAYERS.filter(p => p.position === 'DEF' && p.selected && !p.isBench),
  MID: MOCK_PLAYERS.filter(p => p.position === 'MID' && p.selected && !p.isBench),
  FWD: MOCK_PLAYERS.filter(p => p.position === 'FWD' && p.selected && !p.isBench),
  BENCH: MOCK_PLAYERS.filter(p => p.selected && p.isBench),
}
