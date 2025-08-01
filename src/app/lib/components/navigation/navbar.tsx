"use client";

import { useState } from "react";
import Link from "next/link";


export default function Navbar() {
  const [isMenuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex justify-center">
      {/* Desktop Navigation */}
      <nav className="relative bg-yellow-50 border border-gray-300 p-[5px] font-bold w-full max-w-[1000px] hidden md:block">
        <ul className="flex justify-center list-none m-0 p-0">
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/" className="hover:text-blue-600">
              About
            </Link>
          </li>
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/archives" className="hover:text-blue-600">
              Archives
            </Link>
          </li>
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/auth/register" className="hover:text-blue-600">
              Register
            </Link>
          </li>
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/auth/login" className="hover:text-blue-600">
              Login
            </Link>
          </li>
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/global" className="hover:text-blue-600">
              Global
            </Link>
          </li>
          <li className="ml-[30px] mr-[30px] mt-[4px] mb-[4px] text-black">
            <Link href="/news" className="hover:text-blue-600">
              News
            </Link>
          </li>
          {/* Uncomment if using token-based logout logic */}
          {/* {isTokenValid && (
            <li className="mx-[30px]">
              <button onClick={logout} className="hover:text-red-600">
                Logout
              </button>
            </li>
          )} */}
          <li className="md:hidden">
            {/* This hamburger is hidden on desktop, but we include it in case */}
            <img
              id="hamburger"
              src="/icons/hamburger.png"
              alt="Menu"
              className="h-[23px] mt-[-3px] cursor-pointer"
            />
          </li>
        </ul>
      </nav>

      {/* Mobile Navigation Toggle (Hamburger) */}
      <div className="md:hidden absolute top-4 right-4">
        <button onClick={() => setMenuOpen(!isMenuOpen)} className="focus:outline-none">
          <img
            src="/icons/hamburger.png"
            alt="Menu"
            className="h-[30px] cursor-pointer"
          />
        </button>
      </div>

      {/* Mobile Side Navigation */}
      <div
        id="menuBar"
        className={`fixed top-0 right-0 h-full w-[200px] bg-gray-200 z-50 transform transition-transform duration-500 ease ${
          isMenuOpen ? "translate-x-0" : "translate-x-[13rem]"
        } md:hidden`}
      >
        <button
          id="cross"
          onClick={() => setMenuOpen(false)}
          className="absolute top-[15px] right-[15px] focus:outline-none cursor-pointer"
        >
          <img src="/icons/cross.png" alt="Close" className="w-[15px]" />
        </button>
        <ul className="menuBarList flex flex-col justify-center items-center list-none pt-[50px]">
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/" className="block hover:text-blue-600">
              About
            </Link>
          </li>
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/archives" className="block hover:text-blue-600">
              Archives
            </Link>
          </li>
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/auth/register" className="block hover:text-blue-600">
              Register
            </Link>
          </li>
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/auth/login" className="block hover:text-blue-600">
              Login
            </Link>
          </li>
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/global" className="block hover:text-blue-600">
              Global
            </Link>
          </li>
          <li className="m-[10px] mr-[26%] border-b border-gray-300 py-[10px] pb-[20px]">
            <Link href="/news" className="block hover:text-blue-600">
              News
            </Link>
          </li>
          {/* Uncomment if using token-based logout logic */}
          {/* {isTokenValid && (
            <li className="m-[10px] mr-[26%] py-[10px] block text-red-600 hover:underline">
              <button onClick={logout}>Logout</button>
            </li>
          )} */}
        </ul>
      </div>
    </header>
  );
}
