# Signal K Utilities
This project contains some utilities to be used in the development of signalK plugins. The utilities mainly deal with getting data from the signalK server, processing this data and sending it back to the server for further use.

## the MessageHandler class
This is the core class for getting from the signalK server and sending it back.
The MessageHandler can deal with exactly one path. It can be used to get a delta value from the server once it comes available and to send a modified or newly generated value back to the server.

## the SmoothedMassageHandler class 
This class is a decorator to the MessageHandler class. It is used to  smoothen an incoming delta using 1 of three available smoothers:  ExponentialSmoother, MovingAverageSmoother, KalmanSmoother. The class does support writing smoothed deltas back to SignalK.

## the Polar class 
The class combines two MessageHandler classes using two paths that together contain a vector value (in polar format). For example Speed over Ground and Course over Ground. In addition to getting data from and sending data to the server the class has also methods to perform calculations with vectors, like adding two vectors, scaling or rotating a vector.

## the SmoothedPolar class
This class is a decorator to the Polar class. It is used to smoothen the incoming vector using 1 of three available smoothers:  ExponentialSmoother, MovingAverageSmoother, KalmanSmoother. The smoothedPolar class does not support calculations. The class does support writing smoothed vectors back to SignalK.
