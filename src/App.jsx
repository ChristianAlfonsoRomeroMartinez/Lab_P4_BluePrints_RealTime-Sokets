import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { createSocket } from './lib/socketIoClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8081' // REST API
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE ?? 'http://localhost:8080' // STOMP WebSocket
const IO_BASE  = import.meta.env.VITE_IO_BASE  ?? 'http://localhost:3001' // Node/Socket.IO

export default function App() {
  const [tech, setTech] = useState('stomp')
  const [author, setAuthor] = useState('juan')
  const [name, setName] = useState('plano-1')
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)

  const stompRef = useRef(null)
  const unsubRef = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    setError(null)
    fetch(`${API_BASE}/api/v1/blueprints/${author}/${name}`)
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.json()
      })
      .then(response => {
        console.log('Respuesta del servidor:', response)
        // Manejar estructura {code, message, data} o blueprint directo
        const bp = response.data || response
        console.log('Blueprint extraído:', bp)
        drawAll(bp)
      })
      .catch(err => {
        console.error('Error cargando blueprint:', err)
        setError(`No se pudo cargar "${author}/${name}". Verifica que exista.`)
      })
  }, [tech, author, name])

  function drawAll(bp) {
    console.log('drawAll llamado con:', bp)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) {
      console.warn('Canvas context no disponible')
      return
    }
    ctx.clearRect(0,0,600,400)
    
    if (!bp || !bp.points || !Array.isArray(bp.points) || bp.points.length === 0) {
      console.log('Sin puntos para dibujar. bp:', bp, 'bp.points:', bp?.points)
      return
    }
    
    console.log(`Dibujando ${bp.points.length} puntos:`, bp.points)
    
    // Si solo hay 1 punto, dibujar un círculo
    if (bp.points.length === 1) {
      const p = bp.points[0]
      ctx.fillStyle = '#333'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    
    // Dibujar líneas conectando puntos
    ctx.beginPath()
    bp.points.forEach((p,i)=> {
      if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y)
    })
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // Dibujar círculos en cada punto
    ctx.fillStyle = '#333'
    bp.points.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  useEffect(() => {
    // Cleanup previo
    if (unsubRef.current) {
      unsubRef.current.unsubscribe()
      unsubRef.current = null
    }
    stompRef.current?.deactivate?.()
    stompRef.current = null
    socketRef.current?.disconnect?.()
    socketRef.current = null

    if (tech === 'stomp') {
      const client = createStompClient(STOMP_BASE)
      stompRef.current = client
      client.onConnect = () => {
        console.log('STOMP conectado')
        const topic = `/topic/blueprints.${author}.${name}`
        console.log('Suscribiéndose al topic:', topic)
        unsubRef.current = subscribeBlueprint(client, author, name, (upd)=> {
          console.log('Actualización STOMP RAW:', upd)
          console.log('Tipo:', typeof upd, 'Keys:', Object.keys(upd))
          // Manejar estructura {data} o blueprint directo
          const bp = upd.data || upd
          console.log('Blueprint extraído:', bp)
          console.log('Puntos extraídos:', bp.points)
          drawAll({ points: bp.points || [] })
        })
        console.log('Suscripción exitosa al topic:', topic)
      }
      client.onStompError = (frame) => {
        console.error('Error STOMP:', frame)
      }
      client.activate()
    } else {
      const s = createSocket(IO_BASE)
      socketRef.current = s
      const room = `blueprints.${author}.${name}`
      s.emit('join-room', room)
      s.on('blueprint-update', (upd)=> {
        console.log('Actualización Socket.IO:', upd)
        const bp = upd.data || upd
        drawAll({ points: bp.points || [] })
      })
    }
    return () => {
      if (unsubRef.current) {
        unsubRef.current.unsubscribe()
        unsubRef.current = null
      }
      stompRef.current?.deactivate?.()
      socketRef.current?.disconnect?.()
    }
  }, [tech, author, name])

  function onClick(e) {
    const rect = e.target.getBoundingClientRect()
    const point = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) }
    console.log('Click en:', point)

    if (tech === 'stomp' && stompRef.current?.connected) {
      const payload = { author, name, point }
      console.log('Enviando punto via STOMP')
      console.log('   Destination: /app/draw')
      console.log('   Payload:', payload)
      stompRef.current.publish({ 
        destination: '/app/draw', 
        body: JSON.stringify(payload) 
      })
    } else if (tech === 'socketio' && socketRef.current?.connected) {
      console.log('Enviando punto via Socket.IO')
      const room = `blueprints.${author}.${name}`
      socketRef.current.emit('draw-event', { room, author, name, point })
    } else {
      console.warn('No hay conexión de tiempo real activa')
      console.log('   tech:', tech, 'connected:', stompRef.current?.connected || socketRef.current?.connected)
    }
  }

  return (
    <div style={{fontFamily:'Inter, system-ui', padding:16, maxWidth:900}}>
      <h2>BluePrints RT – Socket.IO vs STOMP</h2>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        <label>Tecnología:</label>
        <select value={tech} onChange={e=>setTech(e.target.value)}>
          <option value="stomp">STOMP (Spring)</option>
          <option value="socketio">Socket.IO (Node)</option>
        </select>
        <input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="autor"/>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="plano"/>
      </div>
      {error && (
        <div style={{padding:12, marginBottom:12, background:'#fee', border:'1px solid #c00', borderRadius:8, color:'#c00'}}>
          {error}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{border:'1px solid #ddd', borderRadius:12}}
        onClick={onClick}
      />
      <p style={{opacity:.7, marginTop:8}}>Tip: abre 2 pestañas y dibuja alternando para ver la colaboración.</p>
    </div>
  )
}
