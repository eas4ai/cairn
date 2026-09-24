/* @jsx h */
import type { ClientSurface } from 'claude-code'

// The braille face (mod/braille.ts) in the band above the prompt, where the terminal shows no
// pictures. The hooks module draws the open and the shut frame for the current expression and
// passes both in; this module blinks between them on the surface's own clock, so a blink costs the
// hooks module nothing. `blinkMs` 0 keeps the eyes open.

type FaceProps = { open: string[]; shut: string[]; color: string; blinkMs: number } | undefined
type State = { tick: number }

const TICK_MS = 150

export default function Face(props: FaceProps, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ tick: 0 })
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (s) surface.setState({ tick: s.tick + 1 })
    })
  }
  if (!props) return <Text> </Text>
  const period = Math.max(2, Math.round(props.blinkMs / TICK_MS))
  const shut = props.blinkMs > 0 && (surface.state?.tick ?? 0) % period === period - 1
  const lines = shut ? props.shut : props.open
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => <Text key={`f${i}`} color={props.color}>{line}</Text>)}
    </Box>
  )
}
