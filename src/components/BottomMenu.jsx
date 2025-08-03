import { PAGES } from '../constants';

export default function BottomMenu({ page, setPage }) {
  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-fuchsia-200 flex justify-center z-50">
      <button
        className={'flex-1 py-3 text-lg font-bold ' + (page === PAGES.SEARCH ? 'text-fuchsia-700' : 'text-gray-400')}
        onClick={() => setPage(PAGES.SEARCH)}
      >
        Søk
      </button>
      <button
        className={'flex-1 py-3 text-lg font-bold ' + (page === PAGES.LOCATION ? 'text-fuchsia-700' : 'text-gray-400')}
        onClick={() => setPage(PAGES.LOCATION)}
      >
        Auto GPS
      </button>
    </nav>
  );
} 