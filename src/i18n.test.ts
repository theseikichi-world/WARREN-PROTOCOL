import { describe, it, expect } from 'vitest'
import { plural } from './i18n'

// Russian picks one of three forms by the last digits. Getting this wrong is the
// single clearest tell of a machine translation — "5 рутины", "21 рутин".
describe('plural (Russian agreement)', () => {
  const routine = (n: number) => `${n} ${plural(n, 'рутина', 'рутины', 'рутин')}`

  it('uses the singular for 1 and anything ending in 1', () => {
    expect(routine(1)).toBe('1 рутина')
    expect(routine(21)).toBe('21 рутина')
    expect(routine(101)).toBe('101 рутина')
  })

  it('uses the few-form for 2-4 and their higher echoes', () => {
    expect(routine(2)).toBe('2 рутины')
    expect(routine(4)).toBe('4 рутины')
    expect(routine(23)).toBe('23 рутины')
  })

  it('uses the many-form for 0, 5-9 and everything else', () => {
    expect(routine(0)).toBe('0 рутин')
    expect(routine(5)).toBe('5 рутин')
    expect(routine(9)).toBe('9 рутин')
    expect(routine(100)).toBe('100 рутин')
  })

  it('handles the 11-14 trap, which takes the many-form despite ending in 1-4', () => {
    expect(routine(11)).toBe('11 рутин')
    expect(routine(12)).toBe('12 рутин')
    expect(routine(13)).toBe('13 рутин')
    expect(routine(14)).toBe('14 рутин')
    // …but 111-114 follow the same rule, while 121 goes back to the singular
    expect(routine(111)).toBe('111 рутин')
    expect(routine(121)).toBe('121 рутина')
  })

  it('reads the magnitude, not the sign', () => {
    expect(plural(-1, 'день', 'дня', 'дней')).toBe('день')
    expect(plural(-5, 'день', 'дня', 'дней')).toBe('дней')
  })
})
