import PeopleSearchShortcut from '@/components/favorites/PeopleSearchShortcut';

export default function FavoritesTemplate({ children }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><PeopleSearchShortcut /></div>
      {children}
    </div>
  );
}
