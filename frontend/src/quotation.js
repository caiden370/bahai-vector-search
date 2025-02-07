import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { BookText } from 'lucide-react';


function Quotation({ Similarity, Text, Sentence, Book, Section, index, fullTextCallback, url, handleScroll}) {
  const [showMore, setShowMore] = useState(false); // State to track button toggle
  const [showSection, setShowSection] = useState(false); // State to track button toggle
  const [nearbyTextResponse, setNearbyTextResponse] = useState(null);
  // const [book, setBook] = useState('');
  // const [section, setSection] = useState('');
  
  
  useEffect(() => {
    setNearbyTextResponse(null);
    }, [Text]);
  
  const handleToggle = () => {
    setShowMore(!showMore); // Toggle the showMore state
  };



  const handleShowSection = () => {
    getNearbyText();
    handleScroll();
  };


  const getNearbyText = async (e) => {
    // e.preventDefault();
    try {
      if (!nearbyTextResponse) { // Check if cached
        const res = await axios.get(`${url}/getnearbytext`, { 
          params: {book: Book, section: Section}, 
          headers: {
            'Content-Type': 'application/json'
          }
        });
        const data = res.data;
        setNearbyTextResponse(data);
        fullTextCallback(data, index);

      }
      else {
        fullTextCallback(nearbyTextResponse);
      }
      
    } 
    catch (error) {
      console.error("Error fetching data from the backend:", error);
    }
  }

  useEffect(() => {
    setShowSection(false);
  }, [Text, Sentence, Book, Section]);


  return (
    <div onClick={handleShowSection} class='result'>
      <div class='result-sentence-container'>
          ...{Sentence} ...
      </div>
      <div class='result-book-container'>
          <BookText class='icon'> </BookText> {Book}
      </div>
    </div>
  );
}

export default Quotation;
