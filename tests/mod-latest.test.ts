import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latest } from '../mod/latest.ts'

const tick = () => new Promise<void>(r => setTimeout(r, 1))

test('overlapping refreshes run one wake at a time, and the newest runs last', async () => {
  const trigger = latest()
  let active = 0, most = 0
  const ran: number[] = []
  const job = (n: number) => async () => {
    active++; most = Math.max(most, active)
    await tick(); await tick()
    ran.push(n); active--
  }
  await Promise.all([trigger(job(1)), trigger(job(2)), trigger(job(3)), trigger(job(4))])
  assert.equal(most, 1)
  assert.deepEqual(ran, [1, 4])
})

test('a refresh asked for while the newest one runs gets its own run after it', async () => {
  const trigger = latest()
  const ran: string[] = []
  await trigger(async () => { await tick(); ran.push('a'); void trigger(async () => { ran.push('b') }) })
  assert.deepEqual(ran, ['a', 'b'])
})

test('a failing refresh does not stop the next one', async () => {
  const trigger = latest()
  const ran: string[] = []
  void trigger(async () => { await tick(); throw new Error('boom') })
  await trigger(async () => { ran.push('after') })
  assert.deepEqual(ran, ['after'])
})
