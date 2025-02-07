import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import Quotation from './quotation';
import Text from './Text';
import './App.css';
import Split from "react-split";
import { LibraryBig, BookOpenText } from 'lucide-react';

const REACT_APP_BACKEND_URL='https://bahai-vector-search.onrender.com';
function App() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [book, setBook] = useState('');
  const [fullText, setFullText] = useState(null);
  const highlightRef = useRef(null);
  const [highlight, setHighlight] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (highlight && highlightRef.current) {
      // Add the highlight class
      highlightRef.current.classList.add('highlight-text');

      // Scroll to the element
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
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
      <div class='book-title'>
        <strong>
        {book}
        </strong>
        
      </div>
    );

  }



  const SplitPanel = () => {
    return (
      <Split
        className="split-container"
        sizes={[50, 50]} // Initial sizes (percent)
        minSize={100} // Minimum size of each panel
        gutterSize={8} // Width of draggable gutter
      >
        {/* Panel 1 */}
        <div class="search-results-container">
          <div class='panel-menu'>
              <div class='panel-header'> 
              <LibraryBig class="icon" size={25}></LibraryBig>
                  <div class='panel-header-text'><strong>Results</strong></div>
              </div>
          </div>
        {response && <p style={{ marginTop: '20px' }}>{handleResponse(response)}</p>}
      </div>
  
        {/* Panel 2 */}
          <div id='fulltext' class="full-text-container">
              <div class='panel-menu'>
                  <div class='panel-header'> 
                      <BookOpenText class="icon" size={25}></BookOpenText>
                      <div class='panel-header-text'><strong>Text</strong></div>
                  </div>
                  {book && handleDisplayBook()}
              </div>
              {fullText && handleFullText()}
          </div>
      </Split>
    );
  };




  return (
    <div class='outer-container'>
	  {/* SEARCH BAR */}
    
      <div class='search-bar-container'>
      <div class='search-filler'></div>
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
      <div class='search-filler'></div>
	  
	  {/* Search Results */}
	<div class="container">
		{/* <div class="search-results-container">
      <div class='panel-menu'>
      <div class='panel-header'> 
      <div class='panel-header-text'><strong>Results</strong></div>
      </div>
      </div>
			{response && <p style={{ marginTop: '20px' }}>{handleResponse(response)}</p>}
		</div>
    
		<div id='fulltext' class="full-text-container">
      <div class='panel-menu'>
        <div class='panel-header'> 
        <div class='panel-header-text'><strong>Text</strong></div>
        
        </div>
        {book && handleDisplayBook()}
      </div>
      {fullText && handleFullText()}
		</div> */}
    {SplitPanel()}
	</div>	

	  
    </div>
  );
}

export default App;
