// Scientific constants (CONST, 40 entries, CODATA 2010 as on fx-991ES/EX class devices)
// and unit conversions (CONV, 40 entries). Values are documented in docs/ASSUMPTIONS.md.

import { D } from './dec';
import * as N from './num';
import type { Num } from './num';

export interface ConstDef {
  readonly n: number;
  readonly sym: string;
  readonly name: string;
  readonly value: string;
  readonly unit: string;
}

export const CONSTANTS: readonly ConstDef[] = [
  { n: 1, sym: 'mp', name: 'proton mass', value: '1.672621777e-27', unit: 'kg' },
  { n: 2, sym: 'mn', name: 'neutron mass', value: '1.674927351e-27', unit: 'kg' },
  { n: 3, sym: 'me', name: 'electron mass', value: '9.10938291e-31', unit: 'kg' },
  { n: 4, sym: 'mμ', name: 'muon mass', value: '1.883531475e-28', unit: 'kg' },
  { n: 5, sym: 'a0', name: 'Bohr radius', value: '5.2917721092e-11', unit: 'm' },
  { n: 6, sym: 'h', name: 'Planck constant', value: '6.62606957e-34', unit: 'J s' },
  { n: 7, sym: 'μN', name: 'nuclear magneton', value: '5.05078353e-27', unit: 'J/T' },
  { n: 8, sym: 'μB', name: 'Bohr magneton', value: '9.27400968e-24', unit: 'J/T' },
  { n: 9, sym: 'ħ', name: 'Planck constant, rationalized', value: '1.054571726e-34', unit: 'J s' },
  { n: 10, sym: 'α', name: 'fine-structure constant', value: '7.2973525698e-3', unit: '' },
  { n: 11, sym: 're', name: 'classical electron radius', value: '2.8179403267e-15', unit: 'm' },
  { n: 12, sym: 'λc', name: 'Compton wavelength', value: '2.4263102389e-12', unit: 'm' },
  { n: 13, sym: 'γp', name: 'proton gyromagnetic ratio', value: '2.675222005e8', unit: '1/(s T)' },
  { n: 14, sym: 'λcp', name: 'proton Compton wavelength', value: '1.32140985623e-15', unit: 'm' },
  { n: 15, sym: 'λcn', name: 'neutron Compton wavelength', value: '1.31959090568e-15', unit: 'm' },
  { n: 16, sym: 'R∞', name: 'Rydberg constant', value: '10973731.568539', unit: '1/m' },
  { n: 17, sym: 'u', name: 'atomic mass constant', value: '1.660538921e-27', unit: 'kg' },
  { n: 18, sym: 'μp', name: 'proton magnetic moment', value: '1.410606743e-26', unit: 'J/T' },
  { n: 19, sym: 'μe', name: 'electron magnetic moment', value: '-9.2847643e-24', unit: 'J/T' },
  { n: 20, sym: 'μn', name: 'neutron magnetic moment', value: '-9.6623647e-27', unit: 'J/T' },
  { n: 21, sym: 'μμ', name: 'muon magnetic moment', value: '-4.49044807e-26', unit: 'J/T' },
  { n: 22, sym: 'F', name: 'Faraday constant', value: '96485.3365', unit: 'C/mol' },
  { n: 23, sym: 'e', name: 'elementary charge', value: '1.602176565e-19', unit: 'C' },
  { n: 24, sym: 'NA', name: 'Avogadro constant', value: '6.02214129e23', unit: '1/mol' },
  { n: 25, sym: 'k', name: 'Boltzmann constant', value: '1.3806488e-23', unit: 'J/K' },
  { n: 26, sym: 'Vm', name: 'molar volume of ideal gas', value: '0.022413968', unit: 'm³/mol' },
  { n: 27, sym: 'R', name: 'molar gas constant', value: '8.3144621', unit: 'J/(mol K)' },
  { n: 28, sym: 'c0', name: 'speed of light in vacuum', value: '299792458', unit: 'm/s' },
  { n: 29, sym: 'c1', name: 'first radiation constant', value: '3.74177153e-16', unit: 'W m²' },
  { n: 30, sym: 'c2', name: 'second radiation constant', value: '0.014387770', unit: 'm K' },
  { n: 31, sym: 'σ', name: 'Stefan-Boltzmann constant', value: '5.670373e-8', unit: 'W/(m² K⁴)' },
  { n: 32, sym: 'ε0', name: 'electric constant', value: '8.854187817e-12', unit: 'F/m' },
  { n: 33, sym: 'μ0', name: 'magnetic constant', value: '1.256637061e-6', unit: 'N/A²' },
  { n: 34, sym: 'Φ0', name: 'magnetic flux quantum', value: '2.067833758e-15', unit: 'Wb' },
  { n: 35, sym: 'g', name: 'standard acceleration of gravity', value: '9.80665', unit: 'm/s²' },
  { n: 36, sym: 'G0', name: 'conductance quantum', value: '7.7480917346e-5', unit: 'S' },
  { n: 37, sym: 'Z0', name: 'characteristic impedance of vacuum', value: '376.730313461', unit: 'Ω' },
  { n: 38, sym: 't', name: 'Celsius temperature', value: '273.15', unit: 'K' },
  { n: 39, sym: 'G', name: 'Newtonian constant of gravitation', value: '6.67384e-11', unit: 'm³/(kg s²)' },
  { n: 40, sym: 'atm', name: 'standard atmosphere', value: '101325', unit: 'Pa' },
];

export function constantValue(n: number): Num | null {
  const c = CONSTANTS[n - 1];
  if (!c) return null;
  return N.na(new D(c.value));
}

/** id used by the editor for a constant key: "@c01" ... "@c40" */
export const constId = (n: number): string => `@c${String(n).padStart(2, '0')}`;
export function constFromId(id: string): number | null {
  const m = /^@c(\d\d)$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 40 ? n : null;
}

export interface ConvDef {
  readonly n: number;
  readonly from: string;
  readonly to: string;
  /** multiplication factor (value_to = value_from * factor), or a function for affine conversions */
  readonly factor?: string;
  readonly fn?: (x: Num) => Num;
}

const f = (n: number, from: string, to: string, factor: string): ConvDef => ({ n, from, to, factor });

export const CONVERSIONS: readonly ConvDef[] = [
  f(1, 'in', 'cm', '2.54'),
  f(2, 'cm', 'in', '0.393700787401574803149606299212598425196850393700787'),
  f(3, 'ft', 'm', '0.3048'),
  f(4, 'm', 'ft', '3.28083989501312335958005249343832020997375328083990'),
  f(5, 'yd', 'm', '0.9144'),
  f(6, 'm', 'yd', '1.09361329833770778652668416447944007874015748031496'),
  f(7, 'mile', 'km', '1.609344'),
  f(8, 'km', 'mile', '0.621371192237333969617434184363059306758'),
  f(9, 'n mile', 'm', '1852'),
  f(10, 'm', 'n mile', '0.000539956803455723542116630669546436285097'),
  f(11, 'acre', 'm²', '4046.8564224'),
  f(12, 'm²', 'acre', '0.000247105381467165'),
  f(13, 'gal(US)', 'ℓ', '3.785411784'),
  f(14, 'ℓ', 'gal(US)', '0.264172052358148'),
  f(15, 'gal(UK)', 'ℓ', '4.54609'),
  f(16, 'ℓ', 'gal(UK)', '0.219969248299088'),
  f(17, 'pc', 'km', '30856775814913.7'),
  f(18, 'km', 'pc', '3.24077928966e-14'),
  f(19, 'km/h', 'm/s', '0.277777777777777777777777777778'),
  f(20, 'm/s', 'km/h', '3.6'),
  f(21, 'oz', 'g', '28.349523125'),
  f(22, 'g', 'oz', '0.0352739619495804'),
  f(23, 'lb', 'kg', '0.45359237'),
  f(24, 'kg', 'lb', '2.20462262184878'),
  f(25, 'atm', 'Pa', '101325'),
  f(26, 'Pa', 'atm', '0.00000986923266716013'),
  f(27, 'mmHg', 'Pa', '133.322368421053'),
  f(28, 'Pa', 'mmHg', '0.00750061682704170'),
  f(29, 'hp', 'kW', '0.745699871582270'),
  f(30, 'kW', 'hp', '1.34102208959503'),
  f(31, 'kgf/cm²', 'Pa', '98066.5'),
  f(32, 'Pa', 'kgf/cm²', '0.0000101971621297793'),
  f(33, 'kgf·m', 'J', '9.80665'),
  f(34, 'J', 'kgf·m', '0.101971621297793'),
  f(35, 'lbf/in²', 'kPa', '6.89475729316836'),
  f(36, 'kPa', 'lbf/in²', '0.145037737730209'),
  {
    n: 37,
    from: '°F',
    to: '°C',
    fn: (x) => N.na(N.toDec(x).sub(32).div(1.8)),
  },
  {
    n: 38,
    from: '°C',
    to: '°F',
    fn: (x) => N.na(N.toDec(x).mul(1.8).add(32)),
  },
  f(39, 'J', 'cal', '0.239005736137667'),
  f(40, 'cal', 'J', '4.184'),
];

export function convert(n: number, x: Num): Num | null {
  const c = CONVERSIONS[n - 1];
  if (!c) return null;
  if (c.fn) return c.fn(x);
  return N.na(N.toDec(x).mul(new D(c.factor!)));
}
