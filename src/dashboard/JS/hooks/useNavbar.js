import { useEffect, useState } from 'react';

import { getStorage, setStorage } from '../storage.js';

const NAVBAR_STORAGE_KEY = 'navbar_expanded';
const MOBILE_BREAKPOINT = 900;

export function useNavbar() {
  const [navbarExpanded, setNavbarExpanded] = useState(() =>
    getStorage(NAVBAR_STORAGE_KEY, true)
  );

  useEffect(() => {
    setStorage(NAVBAR_STORAGE_KEY, navbarExpanded);
  }, [navbarExpanded]);

  useEffect(() => {
    const updateNavbarState = () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        setNavbarExpanded(false);
      }
    };

    updateNavbarState();

    window.addEventListener('resize', updateNavbarState);

    return () => {
      window.removeEventListener('resize', updateNavbarState);
    };
  }, []);

  const toggleNavbar = () => {
    setNavbarExpanded((current) => !current);
  };

  const openNavbar = () => {
    setNavbarExpanded(true);
  };

  const closeNavbar = () => {
    setNavbarExpanded(false);
  };

  return {
    navbarExpanded,
    setNavbarExpanded,
    toggleNavbar,
    openNavbar,
    closeNavbar,
    isNavbarCollapsed: !navbarExpanded,
  };
}