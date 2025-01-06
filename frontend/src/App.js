import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Quotation from './quotation';
import Text from './Text';
import './App.css';


const REACT_APP_BACKEND_URL='http://127.0.0.1:5000';
function App() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [book, setBook] = useState('');
  const [fullText, setFullText] = useState(null);
  const highlightRef = useRef(null);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (highlight && highlightRef.current) {
      // Add the highlight class
      highlightRef.current.classList.add('highlight-text');

      // Scroll to the element
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
	//   setHighlight(false);
    }
  }, [highlight]);

  useEffect(() => {
	if (fullText) {
	  handleScroll();
	}
  }, [fullText]);
  
  



  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.get(`${REACT_APP_BACKEND_URL}/query`, { 
        params: {query: query}, 
        headers: {
          'Content-Type': 'application/json'
        }
      });
      setResponse(res.data.response);
    } catch (error) {
      console.error("Error fetching data from the backend:", error);
    }
  };


  const fullTextCallback = (arg) => {
	setFullText(arg);
  }


  const handleResponse = (response) => {
	return (
	  <div>
		{response.map((r, i) => (
		  <React.Fragment key={i}>
			<hr />
			<div>
			  <Quotation {...r} fullTextCallback={fullTextCallback} url={REACT_APP_BACKEND_URL} handleScroll={handleScroll}></Quotation>
			</div>
		  </React.Fragment>
		))}
	  </div>
	);
  };
  
  const handleFullText = () => {
	return(
		<Text data={fullText.response} section_idx={fullText.section_idx} highlightRef={highlightRef} handleBook={setBook}></Text>
	);
  };

  const handleScroll = () => {
	  setHighlight((prev) => !prev);
	}

  const handleDisplayBook = () => {
    return (
      <span class='book-title'>Book: {book}</span>
    );

  }

  return (
    <div class='outer-container'>
	  {/* SEARCH BAR */}
      <div class='search-bar-container'>
      <form onSubmit={handleSubmit} class='search-form'>
        <input
          class="search-input"
          type="text"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* <button type="submit" class='search-button'>Submit</button> */}
      </form>
      </div>
	  
	  {/* Search Results */}
	<div class="container">
		<div class="search-results-container">
			{response && <p style={{ marginTop: '20px' }}>{handleResponse(response)}</p>}
		</div>
		<div id='fulltext' class="full-text-container">
      {/* {book && handleDisplayBook()} */}
      {fullText && handleFullText()}
			
		</div>
	</div>	

	  
    </div>
  );
}

export default App;
