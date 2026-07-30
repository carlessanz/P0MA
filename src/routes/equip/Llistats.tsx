// Envoltorios de ruta de los tres listados del equipo. Los componentes originales
// (OffersList, ProducersList, EntitiesList) conservan sus props tal cual: aquí solo se
// traduce «abrir detalle» a una navegación.

import { useNavigate } from 'react-router'
import { assegurarContacte } from '../../lib/contactes'
import OffersList from '../../components/OffersList'
import ProducersList from '../../components/ProducersList'
import EntitiesList from '../../components/EntitiesList'

export function Ofertes() {
  const navigate = useNavigate()
  return <OffersList onOpen={(o) => navigate(`/equip/ofertes/${o.id}`)} />
}

export function Productors() {
  const navigate = useNavigate()
  return (
    <ProducersList
      onOpenDetail={(p) => navigate(`/equip/productors/${p.id}`)}
      onNew={() => navigate('/equip/productors/nou')}
      onSendMessage={(phone, name) => {
        void assegurarContacte(phone, name).then(() => navigate(`/equip/missatgeria/${phone}`))
      }}
    />
  )
}

export function Entitats() {
  const navigate = useNavigate()
  return (
    <EntitiesList
      onOpenDetail={(e) => navigate(`/equip/entitats/${e.id}`)}
      onNew={() => navigate('/equip/entitats/nova')}
      onSendMessage={(phone, name) => {
        void assegurarContacte(phone, name).then(() => navigate(`/equip/missatgeria/${phone}`))
      }}
    />
  )
}
